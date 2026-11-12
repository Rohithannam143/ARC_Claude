const SUPABASE_URL = "https://oremmzzhmyhqqftexcor.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_uk5GRLB0Mo7bOzY-piT9tA_NOwaHIZi";
const EDGE_URL = SUPABASE_URL + "/functions/v1/arc";

export async function getSupabaseAccessToken(firebaseIdToken: string): Promise<string> {
  const response = await fetch(EDGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + firebaseIdToken },
    body: JSON.stringify({ action: "token" }),
  });
  const data = await response.json();
  if (!response.ok || !data.token) throw new Error(data.error || "Could not establish a secure cloud session.");
  return data.token as string;
}

export async function cloudRequest<T>(
  firebaseIdToken: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const accessToken = await getSupabaseAccessToken(firebaseIdToken);
  const response = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    ...init,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error("Cloud request failed (" + response.status + "): " + body.slice(0, 240));
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function uploadUserFile(firebaseIdToken: string, file: File, uid: string): Promise<string> {
  const accessToken = await getSupabaseAccessToken(firebaseIdToken);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const objectPath = uid + "/" + crypto.randomUUID() + "-" + safeName;
  const upload = await fetch(SUPABASE_URL + "/storage/v1/object/files/" + objectPath, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: "Bearer " + accessToken,
      "x-upsert": "false",
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });
  if (!upload.ok) throw new Error("File upload failed (" + upload.status + ").");
  return objectPath;
}

export { SUPABASE_URL };
