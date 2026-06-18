// Local JWT-based authentication client replacing @netlify/identity
async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

export async function getUser() {
  const token = localStorage.getItem("dt_token");
  if (!token) return null;

  try {
    const res = await fetchWithTimeout("/api/auth/me", {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });
    if (!res.ok) {
      localStorage.removeItem("dt_token");
      return null;
    }
    const data = await res.json();
    const user = data.user;
    return {
      id: user.id,
      email: user.email,
      roles: user.roles || [],
      user_metadata: {
        full_name: user.name,
        company: user.company
      }
    };
  } catch (err) {
    console.error("Failed to fetch current user:", err);
    return null;
  }
}

export async function login(email, password) {
  const res = await fetchWithTimeout("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "登入失敗");
  }

  localStorage.setItem("dt_token", data.token);
  return {
    id: data.user.id,
    email: data.user.email,
    roles: data.user.roles,
    user_metadata: {
      full_name: data.user.name,
      company: data.user.company
    }
  };
}

export async function logout() {
  localStorage.removeItem("dt_token");
  return Promise.resolve();
}

export async function handleAuthCallback() {
  return null;
}

export async function acceptInvite(token, password) {
  throw new Error("邀請功能未啟用，請聯絡管理員手動建立帳號");
}

export async function recoverPassword(token, password) {
  throw new Error("密碼重設功能目前未啟用");
}

export async function requestPasswordRecovery(email) {
  throw new Error("密碼重設功能目前未啟用");
}
