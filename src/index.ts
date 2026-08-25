// Seishin web client — bare-bones milestone.
//
// Talks to the server's Public API Gateway (gateway/api in the seishin
// repo) using Connect's HTTP+JSON protocol: a plain POST with a JSON body
// per RPC, no generated SDK. This is deliberate for now — it proves the API
// is fetchable without tooling, and this client has no UI design to speak
// of yet. Native voice over WebTransport (CXP/1) is not implemented here;
// this client only exercises identity, session, and directory.

const SERVER_URL = "http://localhost:7700";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function callConnectRPC<Request, Response>(
  serviceName: string,
  methodName: string,
  request: Request,
): Promise<Response> {
  const response = await fetch(`${SERVER_URL}/${serviceName}/${methodName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`${serviceName}/${methodName} failed: ${response.status} ${errorBody}`);
  }
  return response.json() as Promise<Response>;
}

interface HelloResponse {
  serverVersion: string;
  serverInfo: { name: string; motd?: string };
  nonce: string; // base64
  authMethods: string[];
}

interface SessionIdentity {
  publicKey: string; // base64
  userId: string;
  handle?: string;
}

interface Session {
  sessionId: string;
  identity: SessionIdentity;
  capabilities: string[];
  resumeToken: string;
}

interface AuthenticateResponse {
  session: Session;
}

interface Space {
  spaceId: string;
  name: string;
}

interface ListSpacesResponse {
  spaces: Space[];
}

interface Channel {
  channelId: string;
  spaceId: string;
  name: string;
  kind: string;
  spatialPolicy?: string;
}

interface ListChannelsResponse {
  channels: Channel[];
}

async function loginAsGuest(guestDisplayName: string): Promise<Session> {
  const hello = await callConnectRPC<Record<string, never>, HelloResponse>(
    "seishin.v1.SessionService",
    "Hello",
    {},
  );

  const keyPair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const publicKeyBytes = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
  const nonceBytes = base64ToBytes(hello.nonce);
  const signatureBytes = new Uint8Array(
    await crypto.subtle.sign({ name: "Ed25519" }, keyPair.privateKey, nonceBytes as BufferSource),
  );

  const authenticated = await callConnectRPC<
    { identityPublicKey: string; nonce: string; signature: string; guestDisplayName: string },
    AuthenticateResponse
  >("seishin.v1.SessionService", "Authenticate", {
    identityPublicKey: bytesToBase64(publicKeyBytes),
    nonce: hello.nonce,
    signature: bytesToBase64(signatureBytes),
    guestDisplayName,
  });

  return authenticated.session;
}

async function loadDirectory(): Promise<{ spaces: Space[]; channelsBySpaceId: Map<string, Channel[]> }> {
  const { spaces } = await callConnectRPC<Record<string, never>, ListSpacesResponse>(
    "seishin.v1.DirectoryService",
    "ListSpaces",
    {},
  );

  const channelsBySpaceId = new Map<string, Channel[]>();
  for (const space of spaces) {
    const { channels } = await callConnectRPC<{ spaceId: string }, ListChannelsResponse>(
      "seishin.v1.DirectoryService",
      "ListChannels",
      { spaceId: space.spaceId },
    );
    channelsBySpaceId.set(space.spaceId, channels);
  }

  return { spaces, channelsBySpaceId };
}

function renderDirectory(session: Session, spaces: Space[], channelsBySpaceId: Map<string, Channel[]>): void {
  const root = document.getElementById("app");
  if (!root) return;
  root.innerHTML = "";

  const identityLine = document.createElement("p");
  identityLine.textContent = `Signed in as ${session.identity.userId} — capabilities: ${session.capabilities.join(", ")}`;
  root.appendChild(identityLine);

  for (const space of spaces) {
    const spaceHeading = document.createElement("h2");
    spaceHeading.textContent = space.name;
    root.appendChild(spaceHeading);

    const channelList = document.createElement("ul");
    for (const channel of channelsBySpaceId.get(space.spaceId) ?? []) {
      const channelItem = document.createElement("li");
      channelItem.textContent = `${channel.name} (${channel.kind})`;
      channelList.appendChild(channelItem);
    }
    root.appendChild(channelList);
  }
}

async function main(): Promise<void> {
  const statusElement = document.getElementById("status");
  const setStatus = (text: string) => {
    if (statusElement) statusElement.textContent = text;
  };

  try {
    setStatus("Signing in as guest...");
    const session = await loginAsGuest("web-guest");

    setStatus("Loading directory...");
    const { spaces, channelsBySpaceId } = await loadDirectory();

    setStatus("");
    renderDirectory(session, spaces, channelsBySpaceId);
  } catch (error) {
    setStatus(`Error: ${(error as Error).message}`);
    console.error(error);
  }
}

main();
