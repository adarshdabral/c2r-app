const {
  otpTemplate,
  verificationTemplate,
  resetPasswordTemplate,
} = require('../utils/emailTemplates');

describe('email templates', () => {
  test('otpTemplate interpolates the code and name', () => {
    const html = otpTemplate('123456', 'Asha');
    expect(html).toContain('123456');
    expect(html).toContain('Asha');
    expect(html).toMatch(/<!DOCTYPE html>/i);
  });

  test('otpTemplate falls back to a default username', () => {
    expect(otpTemplate('000000')).toContain('User');
  });

  test('verificationTemplate embeds the verification link', () => {
    const link = 'https://example.com/verify?t=abc';
    const html = verificationTemplate(link, 'Bob');
    expect(html).toContain(link);
    expect(html).toContain('Bob');
  });

  test('resetPasswordTemplate embeds the reset link', () => {
    const link = 'https://example.com/reset?t=xyz';
    expect(resetPasswordTemplate(link, 'Cara')).toContain(link);
  });
});
