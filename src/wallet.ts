import { Core } from "@walletconnect/core";
import { WalletKit, WalletKitTypes } from "@reown/walletkit";
import { buildApprovedNamespaces, getSdkError } from "@walletconnect/utils";

let core: Core | null = null;
let walletKit: WalletKitTypes | null = null;

export async function initWalletKit(opts: { projectId: string; metadata: any }) {
  if (!opts?.projectId) throw new Error("PROJECT_ID is required to initialize WalletKit");

  core = new Core({ projectId: opts.projectId });

  walletKit = await WalletKit.init({
    core,
    metadata: opts.metadata || {
      name: "StreamBridge Wallet",
      description: "Wallet integration for StreamBridge",
      url: "https://example.com",
      icons: [],
    },
  });

  // Basic event handlers (apps should present UI for these flows)
  walletKit.on("session_proposal", async (proposal) => {
    console.log("session_proposal received", proposal);
    try {
      // For safety, reject by default. Replace this with UI flow to approve.
      await walletKit!.rejectSession({ id: proposal.id, reason: getSdkError("USER_REJECTED") });
    } catch (e) {
      console.error("error handling session_proposal", e);
    }
  });

  walletKit.on("session_request", async (event) => {
    console.log("session_request", event);
    // Applications should parse and respond appropriately (sign, transfer, etc.)
  });

  walletKit.on("session_delete", (session) => {
    console.log("session deleted", session);
  });

  return walletKit;
}

export function getWalletKitInstance() {
  return walletKit;
}

export async function pairURI(uri: string) {
  if (!walletKit) throw new Error("walletKit not initialized");
  return walletKit.pair({ uri });
}

export function getActiveSessions() {
  if (!walletKit) return [];
  return walletKit.getActiveSessions();
}

export async function disconnectSession(topic: string) {
  if (!walletKit) throw new Error("walletKit not initialized");
  return walletKit.disconnectSession({ topic, reason: getSdkError("USER_DISCONNECTED") });
}
