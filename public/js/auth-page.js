if (Session.token && Session.user) {
  window.location.href = '/dashboard.html';
}

const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginError = document.getElementById('login-error');
const registerError = document.getElementById('register-error');

document.getElementById('show-register').addEventListener('click', () => {
  loginForm.classList.add('hidden');
  registerForm.classList.remove('hidden');
});
document.getElementById('show-login').addEventListener('click', () => {
  registerForm.classList.add('hidden');
  loginForm.classList.remove('hidden');
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  try {
    const data = await api('/login', { method: 'POST', body: { username, password } });
    Session.save(data.token, data.user);
    window.location.href = '/dashboard.html';
  } catch (err) {
    loginError.textContent = err.message;
  }
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  registerError.textContent = '';
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value;
  try {
    const data = await api('/register', { method: 'POST', body: { username, password } });
    Session.save(data.token, data.user);
    window.location.href = '/dashboard.html';
  } catch (err) {
    registerError.textContent = err.message;
  }
});
