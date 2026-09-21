const config = window.MARGINI_ONLINE_CONFIG;
export const isOnline = Boolean(config?.url && config?.anonKey);
let session = null;
let loginPromise = null;
let setupPromise = null;

function readSession() {
  try { return JSON.parse(sessionStorage.getItem('margini-session') || 'null'); } catch { return null; }
}

function saveSession(value) {
  if (value?.expires_in && !value.expires_at) value.expires_at = Math.floor(Date.now() / 1000) + value.expires_in;
  session = value;
  if (value) sessionStorage.setItem('margini-session', JSON.stringify(value));
  else sessionStorage.removeItem('margini-session');
}

async function authRequest(path, payload) {
  const response = await fetch(`${config.url}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: config.anonKey, 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.msg || data.error_description || data.message || 'ACCESSO_NON_RIUSCITO');
  return data;
}

function passwordSetup() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'login-overlay';
    overlay.innerHTML = `<form class="login-card"><h2>Imposta la password</h2><p>Completa l’invito per accedere a Margini.</p><label>Nuova password<input type="password" name="password" autocomplete="new-password" minlength="8" required></label><label>Ripeti password<input type="password" name="confirm" autocomplete="new-password" minlength="8" required></label><button class="primary" type="submit">Salva password</button><p class="login-error" role="alert"></p></form>`;
    document.body.append(overlay);
    const form = overlay.querySelector('form');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const password = form.elements.password.value;
      if (password !== form.elements.confirm.value) {
        form.querySelector('.login-error').textContent = 'Le password non coincidono.';
        return;
      }
      const button = form.querySelector('button');
      button.disabled = true;
      try {
        const response = await fetch(`${config.url}/auth/v1/user`, {
          method: 'PUT',
          headers: { apikey: config.anonKey, authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ password })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.msg || data.message || 'PASSWORD_NOT_SAVED');
        overlay.remove();
        resolve();
      } catch (error) {
        form.querySelector('.login-error').textContent = error.message;
        button.disabled = false;
      }
    });
  });
}

if (isOnline && location.hash.startsWith('#')) {
  const values = new URLSearchParams(location.hash.slice(1));
  const accessToken = values.get('access_token');
  const refreshToken = values.get('refresh_token');
  if (accessToken && refreshToken) {
    saveSession({ access_token: accessToken, refresh_token: refreshToken, expires_in: Number(values.get('expires_in') || 3600) });
    history.replaceState(null, '', location.pathname + location.search);
    if (['invite', 'recovery'].includes(values.get('type'))) setupPromise = passwordSetup();
  }
}

function loginForm() {
  if (loginPromise) return loginPromise;
  loginPromise = new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'login-overlay';
    overlay.innerHTML = `<form class="login-card"><h2>Accedi a Margini</h2><p>Usa l’account autorizzato in Supabase.</p><label>Email<input type="email" name="email" autocomplete="username" required></label><label>Password<input type="password" name="password" autocomplete="current-password" required></label><button class="primary" type="submit">Accedi</button><p class="login-error" role="alert"></p></form>`;
    document.body.append(overlay);
    const form = overlay.querySelector('form');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button');
      button.disabled = true;
      try {
        const values = new FormData(form);
        const data = await authRequest('token?grant_type=password', { email: values.get('email'), password: values.get('password') });
        saveSession(data);
        overlay.remove();
        loginPromise = null;
        resolve(data.access_token);
      } catch (error) {
        form.querySelector('.login-error').textContent = error.message;
        button.disabled = false;
      }
    });
  });
  return loginPromise;
}

async function accessToken() {
  if (!isOnline) return null;
  if (setupPromise) { await setupPromise; setupPromise = null; }
  if (!session) session = readSession();
  if (session?.access_token && session.expires_at > Math.floor(Date.now() / 1000) + 60) return session.access_token;
  if (session?.refresh_token) {
    try {
      saveSession(await authRequest('token?grant_type=refresh_token', { refresh_token: session.refresh_token }));
      return session.access_token;
    } catch { saveSession(null); }
  }
  return loginForm();
}

export async function apiFetch(path, options = {}) {
  if (!isOnline) {
    if (!['127.0.0.1', 'localhost'].includes(location.hostname)) throw new Error('ONLINE_CONFIG_MISSING');
    return fetch(path, options);
  }
  const token = await accessToken();
  const importRoute = path.startsWith('/api/imports/');
  const route = importRoute ? null : path.replace(/^\/api\//, '');
  const url = importRoute
    ? `${config.url}/functions/v1/import-google-sheet`
    : `${config.url}/functions/v1/online-api?route=${encodeURIComponent(route)}`;
  let body = options.body;
  if (importRoute) {
    const data = JSON.parse(body);
    if (path.endsWith('/preview')) data.action = 'preview';
    if (path.endsWith('/confirm')) data.action = 'confirm';
    body = JSON.stringify(data);
  }
  return fetch(url, { ...options, body, headers: { ...options.headers, apikey: config.anonKey, authorization: `Bearer ${token}` } });
}
