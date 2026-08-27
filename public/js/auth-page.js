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

const PASSWORD_RULES = {
  length: (pw) => pw.length >= 8,
  upper: (pw) => /[A-Z]/.test(pw),
  number: (pw) => /[0-9]/.test(pw),
  special: (pw) => /[^A-Za-z0-9]/.test(pw),
};

const regPasswordInput = document.getElementById('reg-password');
const regPasswordConfirmInput = document.getElementById('reg-password-confirm');
const pwRequirementItems = document.querySelectorAll('#pw-requirements li');

function passwordMeetsAllRules(pw) {
  return Object.values(PASSWORD_RULES).every((test) => test(pw));
}

regPasswordInput.addEventListener('input', () => {
  const pw = regPasswordInput.value;
  pwRequirementItems.forEach((li) => {
    const rule = PASSWORD_RULES[li.dataset.rule];
    li.classList.toggle('met', rule ? rule(pw) : false);
  });
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  registerError.textContent = '';
  const username = document.getElementById('reg-username').value.trim();
  const password = regPasswordInput.value;
  const passwordConfirm = regPasswordConfirmInput.value;

  if (!passwordMeetsAllRules(password)) {
    registerError.textContent = 'A senha não atende aos requisitos listados acima.';
    return;
  }
  if (password !== passwordConfirm) {
    registerError.textContent = 'As senhas não coincidem.';
    return;
  }

  try {
    const data = await api('/register', { method: 'POST', body: { username, password } });
    Session.save(data.token, data.user);
    window.location.href = '/dashboard.html';
  } catch (err) {
    registerError.textContent = err.message;
  }
});
