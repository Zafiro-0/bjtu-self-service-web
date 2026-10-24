type Credentials = { username: string; password: string };
type CredentialRecord = { id: "campus"; iv: ArrayBuffer; cipher: ArrayBuffer };

const databaseName = "bjtu-self-service";
const databaseVersion = 1;
const keyStore = "keys";
const credentialStore = "credentials";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(keyStore)) database.createObjectStore(keyStore);
      if (!database.objectStoreNames.contains(credentialStore)) database.createObjectStore(credentialStore, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("无法打开本机安全存储。"));
  });
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("本机安全存储操作失败。"));
  });
}

async function encryptionKey(database: IDBDatabase) {
  const readTransaction = database.transaction(keyStore, "readonly");
  const existing = await requestResult(readTransaction.objectStore(keyStore).get("device")) as CryptoKey | undefined;
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const writeTransaction = database.transaction(keyStore, "readwrite");
  await requestResult(writeTransaction.objectStore(keyStore).put(key, "device"));
  return key;
}

export async function saveCredentials(credentials: Credentials) {
  const database = await openDatabase();
  try {
    const key = await encryptionKey(database);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(credentials)));
    const transaction = database.transaction(credentialStore, "readwrite");
    await requestResult(transaction.objectStore(credentialStore).put({ id: "campus", iv: iv.buffer, cipher } satisfies CredentialRecord));
  } finally {
    database.close();
  }
}

export async function loadCredentials(): Promise<Credentials | null> {
  const database = await openDatabase();
  try {
    const keyTransaction = database.transaction(keyStore, "readonly");
    const key = await requestResult(keyTransaction.objectStore(keyStore).get("device")) as CryptoKey | undefined;
    const credentialTransaction = database.transaction(credentialStore, "readonly");
    const record = await requestResult(credentialTransaction.objectStore(credentialStore).get("campus")) as CredentialRecord | undefined;
    if (!key || !record) return null;
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(record.iv) }, key, record.cipher);
    const parsed = JSON.parse(new TextDecoder().decode(plain)) as Partial<Credentials>;
    return parsed.username && parsed.password ? { username: parsed.username, password: parsed.password } : null;
  } catch {
    return null;
  } finally {
    database.close();
  }
}

export async function clearCredentials() {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
    request.onerror = () => reject(request.error || new Error("无法清除本机登录信息。"));
  });
}
