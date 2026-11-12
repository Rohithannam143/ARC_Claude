const SUPABASE_URL = "https://oremmzzhmyhqqftexcor.supabase.co";
const EDGE_URL = SUPABASE_URL + "/functions/v1/arc";

async function edgeResponse<T>(firebaseIdToken: string, body: BodyInit, contentType?: string): Promise<T> {
  const headers: Record<string, string> = { Authorization: "Bearer " + firebaseIdToken };
  if (contentType) headers["Content-Type"] = contentType;
  const response = await fetch(EDGE_URL, { method: "POST", headers, body });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!response.ok) throw new Error(data.error || "Secure cloud request failed (" + response.status + ").");
  return data as T;
}

export async function cloudRequest<T>(firebaseIdToken: string, path: string, init: RequestInit = {}): Promise<T> {
  const method = String(init.method || "GET").toUpperCase();
  let payload: unknown = undefined;
  if (init.body && typeof init.body === "string") {
    try { payload = JSON.parse(init.body); } catch { throw new Error("Invalid cloud request payload."); }
  }
  return edgeResponse<T>(firebaseIdToken, JSON.stringify({ action: "cloud", resource: "rest", path, method, payload }), "application/json");
}

export async function uploadUserFile(firebaseIdToken: string, file: File, _uid: string): Promise<string> {
  const form = new FormData();
  form.append("file", file, file.name);
  const result = await edgeResponse<{ path: string }>(firebaseIdToken, form);
  if (!result.path) throw new Error("The cloud upload did not return a file location.");
  return result.path;
}

export { SUPABASE_URL };
