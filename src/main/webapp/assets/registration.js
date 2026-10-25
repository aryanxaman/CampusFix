/* Public signup creates Student accounts only. Existing roles are managed by Admin. */
const registrationLogin = renderLogin;
renderLogin = function () {
  registrationLogin();
  const accountHint = [...document.querySelectorAll('.login-inner > p')].find((p) =>
    p.textContent.includes('Need an account?')
  );
  if (accountHint) accountHint.textContent = 'Faculty or staff? Contact your campus administrator.';
  if (!location.pathname.endsWith('preview.html')) {
    document
      .querySelector('.login-inner')
      ?.insertAdjacentHTML(
        'beforeend',
        '<p class="signup-link" style="text-align:center;margin-top:20px">New student? <a class="text-link" href="#signup">Create your account →</a></p>'
      );
  }
};

function renderSignup() {
  registrationLogin();
  const inner = document.querySelector('.login-inner');
  inner.querySelector('h1').textContent = 'Your campus. Your account.';
  inner.querySelector('h1 + p').textContent =
    'Register as a student and select your current hostel.';
  inner.querySelector('.demo-entry')?.remove();
  inner.querySelector('form').outerHTML = `
    <form id="student-signup-form">
      <div class="field"><label for="signup-name">Full name *</label><input id="signup-name" name="name" required minlength="2" maxlength="100" autocomplete="name"></div>
      <div class="field"><label for="signup-email">VIT email address *</label><input id="signup-email" name="email" type="email" required maxlength="190" autocomplete="username" placeholder="you@vitstudent.ac.in"></div>
      <div class="field"><label for="signup-block">Your hostel block *</label><select id="signup-block" name="hostelBlock" required disabled><option value="">Loading hostel blocks…</option></select><small>You can report in all academic buildings and only this hostel. Contact Admin if you move to another hostel.</small></div>
      <div class="form-grid"><div class="field"><label for="signup-password">Password *</label><input id="signup-password" name="password" type="password" required minlength="12" maxlength="72" autocomplete="new-password"></div><div class="field"><label for="signup-confirm">Confirm password *</label><input id="signup-confirm" name="confirm" type="password" required minlength="12" maxlength="72" autocomplete="new-password"></div></div>
      <p class="muted" style="font-size:12px">Use at least 12 characters, up to 72 UTF-8 bytes. This creates a Student account.</p>
      <button class="btn-primary" type="submit" style="width:100%" disabled>Create student account ${icon('arrow-right')}</button>
    </form>`;
  inner.lastElementChild?.matches('p') &&
    (inner.lastElementChild.innerHTML =
      'Already registered? <a class="text-link" href="#login">Sign in</a>');
  const form = document.getElementById('student-signup-form');
  api('config')
    .then((config) => {
      if (!form.isConnected) return;
      const select = form.querySelector('[name="hostelBlock"]');
      select.innerHTML =
        '<option value="">Select your hostel block</option>' +
        config.hostelBlocks
          .map((block) => `<option value="${esc(block)}">${esc(block)} Block</option>`)
          .join('');
      select.disabled = false;
      form.querySelector('[type="submit"]').disabled = false;
    })
    .catch(() =>
      toast('Could not load hostel choices. Please check the server and try again.', true)
    );
}

document.addEventListener('submit', async (event) => {
  if (event.target.id !== 'student-signup-form') return;
  event.preventDefault();
  const form = event.target;
  const button = form.querySelector('[type="submit"]');
  const data = Object.fromEntries(new FormData(form));
  button.disabled = true;
  try {
    if (data.password !== data.confirm) throw Error('Passwords do not match.');
    if (new TextEncoder().encode(data.password).length > 72)
      throw Error('Use at most 72 UTF-8 bytes for the password.');
    delete data.confirm;
    await api('register', { method: 'POST', body: JSON.stringify(data) });
    location.hash = 'login';
    renderLogin();
    toast('Student account created. Sign in with your email and password.');
  } catch (error) {
    toast(error.message, true);
  } finally {
    if (button.isConnected) button.disabled = false;
  }
});

if (!state.user && ['#login', '#signup'].includes(location.hash)) render();
