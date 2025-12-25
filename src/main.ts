import 'dotenv/config';
import { initWalletKit, getActiveSessions } from "./wallet";

async function main() {
  const projectId = process.env.PROJECT_ID || "";

  if (!projectId) {
    console.warn("No PROJECT_ID provided. Set env var PROJECT_ID before running in cloud mode.");
  }

  const wallet = await initWalletKit({
    projectId,
    metadata: {
      name: "StreamBridge Wallet",
      description: "StreamBridge WalletKit integration",
      url: "https://example.com",
      icons: [],
    },
  });

  console.log("WalletKit initialized.");

  const sessions = getActiveSessions();
  console.log("Active sessions:", sessions);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
