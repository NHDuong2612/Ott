// Domain eligibility only: this does not verify ownership of the mailbox.
export const normalizeEmail = value => String(value || '').trim().toLowerCase();
export const isVnuEmail = value => {
  const email = normalizeEmail(value);
  return email.length <= 254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@vnu\.edu\.vn$/.test(email)
    && !email.startsWith('.') && !email.includes('..') && !email.includes('.@');
};
export const accountAllowed = user => !!user && (!!user.is_admin || isVnuEmail(user.email));
export function requireVnuEmail(value) {
  const email = normalizeEmail(value);
  if (!isVnuEmail(email)) throw Object.assign(new Error('Sinh viên cần dùng email có tên miền @vnu.edu.vn.'), { status: 400 });
  return email;
}
