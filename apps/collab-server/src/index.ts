import { Server } from "@hocuspocus/server";

const server = Server.configure({
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 1234,
  
  async onAuthenticate(data) {
    // Basic auth check placeholder
    const { token } = data;
    if (!token) throw new Error("Unauthorized");
    return { user: { id: "test-user" } };
  },

  async onStoreDocument(data) {
    // Here we will eventually connect to packages/github-client to save to GitHub
    // on a background interval or when the document is closed
    console.log(`Document ${data.documentName} changed. Placeholder for GitHub sync.`);
  },
});

server.listen();
console.log(`Collab server running on ws://localhost:1234`);
