import 'dotenv/config';
import { Core } from "@walletconnect/core";
import { WalletKit } from "@reown/walletkit";
import { getSdkError, buildApprovedNamespaces } from "@walletconnect/utils";
import fs from "fs";
import path from "path";
import readline from "readline";

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(question, (ans) => { rl.close(); res(ans); }));
}

function usage() {
  console.log("Usage: node src/wallet-cli.mjs <command> [args]");
  console.log("Commands:");
  console.log("  pair <uri>          Pair with a dApp WC URI");
  console.log("  list                List active sessions");
  console.log("  disconnect <topic>  Disconnect session by topic");
}

const [, , cmd, ...rest] = process.argv;

async function main() {
  if (!cmd) {
    usage();
    process.exit(1);
  }

  const projectId = process.env.PROJECT_ID;
  if (!projectId) {
    console.error("Please set PROJECT_ID environment variable from WalletConnect dashboard.");
    process.exit(2);
  }

  const core = new Core({ projectId });
  const walletKit = await WalletKit.init({
    core,
    metadata: {
      name: "StreamBridge Wallet CLI",
      description: "CLI helper for WalletKit",
      url: "https://example.com",
      icons: [],
    },
  });

  // Hybrid session proposal handler: try auto-approve using persisted config, otherwise prompt
  const cfgPath = path.join(process.cwd(), "config", "approved-namespaces.json");
  let persistedConfig = null;
  try {
    if (fs.existsSync(cfgPath)) {
      persistedConfig = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
      console.log("Loaded persisted approved-namespaces config (auto-approve may be enabled).");
    }
  } catch (e) {
    console.warn("Could not read persisted config:", e.message || e);
  }

  walletKit.on("session_proposal", async (proposal) => {
    console.log("\n--- Session proposal received ---\n");
    console.log(JSON.stringify(proposal, null, 2));

    // persist a copy for inspection
    try {
      fs.mkdirSync("tmp", { recursive: true });
      fs.writeFileSync("tmp/last-proposal.json", JSON.stringify(proposal, null, 2));
      console.log("Saved proposal to tmp/last-proposal.json\n");
    } catch (e) {
      console.warn("Could not save proposal:", e.message);
    }

    // Attempt auto-approve if persistedConfig exists and autoApprove is true
    if (persistedConfig && persistedConfig.autoApprove && persistedConfig.supportedNamespaces) {
      try {
        const proposalPayload = proposal.params ?? proposal;
        const approved = buildApprovedNamespaces({ proposal: proposalPayload, supportedNamespaces: persistedConfig.supportedNamespaces });
        const session = await walletKit.approveSession({ id: proposal.id, namespaces: approved });
        console.log("Auto-approved session. Session topic:", session.topic || session);
        return;
      } catch (e) {
        console.warn("Auto-approve failed, falling back to interactive prompt:", e.message || e);
      }
    }

    // Interactive approval flow
    const ans = (await prompt("Approve this session proposal? (y/N) ")).trim().toLowerCase();
    if (ans === "y" || ans === "yes") {
      // Ask for accounts to include if any
      const accountsInput = (await prompt("Enter comma-separated CAIP-10 accounts to include (or leave empty): ")).trim();
      const accounts = accountsInput ? accountsInput.split(/\s*,\s*/).filter(Boolean) : [];

      // Build a supportedNamespaces object by mirroring requested namespaces but adding accounts
      const proposalPayload = proposal.params ?? proposal;
      const requiredNamespaces = (proposalPayload.requiredNamespaces ?? proposalPayload.required) || {};
      const supportedNamespaces = {};
      for (const key of Object.keys(requiredNamespaces)) {
        const req = requiredNamespaces[key] || {};
        supportedNamespaces[key] = {
          chains: req.chains || [],
          methods: req.methods || [],
          events: req.events || [],
          accounts: accounts,
        };
      }

      try {
        const approved = buildApprovedNamespaces({ proposal: proposalPayload, supportedNamespaces });
        const session = await walletKit.approveSession({ id: proposal.id, namespaces: approved });
        console.log("Approved session. Session topic:", session.topic || session);

        const saveAns = (await prompt("Persist this supportedNamespaces for future auto-approval? (y/N) ")).trim().toLowerCase();
        if (saveAns === "y" || saveAns === "yes") {
          try {
            fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
            const cfg = { autoApprove: true, supportedNamespaces };
            fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
            console.log("Saved config to", cfgPath);
            persistedConfig = cfg;
          } catch (e) {
            console.warn("Failed to save config:", e.message || e);
          }
        }

        return;
      } catch (e) {
        console.error("Failed to approve session:", e?.message || e);
        try {
          await walletKit.rejectSession({ id: proposal.id, reason: getSdkError("USER_REJECTED") });
        } catch (rejErr) {}
        return;
      }
    }

    // reject by default
    try {
      await walletKit.rejectSession({ id: proposal.id, reason: getSdkError("USER_REJECTED") });
      console.log("Session proposal rejected.");
    } catch (e) {
      console.error("Failed to reject proposal:", e?.message || e);
    }
  });

  if (cmd === "pair") {
    const uri = rest[0];
    if (!uri) {
      console.error("pair requires a uri argument");
      process.exit(1);
    }
    const result = await walletKit.pair({ uri });
    console.log("paired: ", result);
    process.exit(0);
  }

  if (cmd === "list") {
    const sessions = walletKit.getActiveSessions();
    console.log(JSON.stringify(sessions, null, 2));
    process.exit(0);
  }

  if (cmd === "disconnect") {
    const topic = rest[0];
    if (!topic) {
      console.error("disconnect requires a topic argument");
      process.exit(1);
    }
    await walletKit.disconnectSession({ topic, reason: getSdkError("USER_DISCONNECTED") });
    console.log("disconnected", topic);
    process.exit(0);
  }

  usage();
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
