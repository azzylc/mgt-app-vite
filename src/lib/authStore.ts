/**
 * Auth Token Storage - localStorage ile
 */

let cachedToken: string | null = null;

export async function setToken(token: string): Promise<void> {
  cachedToken = token;
  localStorage.setItem('authToken', token);
}

export async function getToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  
  const token = localStorage.getItem('authToken');
  if (token) {
    cachedToken = token;
  }
  return token;
}

export async function clearToken(): Promise<void> {
  cachedToken = null;
  localStorage.removeItem('authToken');
}
