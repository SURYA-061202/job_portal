import { useEffect, useState } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { sendPasswordResetMail, verifyEmailExists, sendSignupOtp, verifySignupOtp } from '@/lib/emailFunctions';
import { useNavigate } from 'react-router-dom';
import popup from '@/components/ui/Popup';
import { Mail, Phone, User, Eye, EyeOff, ShieldCheck, ArrowLeft } from 'lucide-react';

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [mobile, setMobile] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  /** Signup is two steps: details -> email code. The auth account is only
   *  created after the code checks out, so an abandoned signup leaves nothing. */
  const [signupStage, setSignupStage] = useState<'details' | 'verify'>('details');
  const [otp, setOtp] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();

    // Strict format check before any auth call: a malformed or missing
    // address never reaches Firebase, so sign up / sign in cannot complete.
    // Requires a real alphabetic TLD (gmail.com, outlook.com, company.co.in...).
    const trimmedEmail = email.trim();
    const emailValid = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(trimmedEmail);
    if (!emailValid) {
      popup.error('Please enter a valid email address (e.g. name@gmail.com).');
      return;
    }

    setLoading(true);

    try {
      if (isLogin) {
        const userCredential = await signInWithEmailAndPassword(auth, trimmedEmail, password);
        const user = userCredential.user;

        // Fetch user data to check role
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          if (userData.role === 'manager' || userData.role === 'recruiter' || userData.role === 'admin') {
            navigate('/dashboard');
          } else {
            navigate('/home');
          }
        } else {
          // If no doc exists, default to user view
          navigate('/home');
        }
        popup.success('Login successful!');
      } else {
        if (password.length < 6) {
          popup.error('Password should be at least 6 characters long.');
          return;
        }

        // Block signup when the mail server says the mailbox does not exist.
        // Unknown (null) or a failed check allows signup, so a legitimate
        // user is never locked out by the verification service being down.
        const mailboxExists = await verifyEmailExists(trimmedEmail).catch(() => null);
        if (mailboxExists === false) {
          popup.error("This email address doesn't seem to exist. Please check the address and try again.");
          return;
        }

        // No account is created yet - just email the 6-digit code and switch
        // the form to the code entry step.
        await sendSignupOtp({ email: trimmedEmail.toLowerCase() });
        setSignupStage('verify');
        setOtp('');
        setResendIn(30);
        popup.success(`Verification code sent to ${trimmedEmail.toLowerCase()}. Check your inbox.`);
      }
    } catch (error) {
      const code = (error as { code?: string })?.code;
      const message = (error as { message?: string })?.message;
      if (code === 'functions/failed-precondition' || code === 'functions/resource-exhausted') {
        popup.error(message || 'Please wait a moment and try again.');
      } else if (code === 'functions/internal') {
        popup.error(message || 'Failed to send the verification email. Please try again.');
      } else if (code === 'auth/invalid-credential' || code === 'auth/user-not-found' || code === 'auth/wrong-password') {
        popup.error('Incorrect email or password. Please try again.');
      } else if (code === 'auth/invalid-email') {
        popup.error('Please enter a valid email address.');
      } else if (code === 'auth/weak-password') {
        popup.error('Password should be at least 6 characters long.');
      } else if (code === 'auth/network-request-failed') {
        popup.error('Network error. Please check your connection and try again.');
      } else if (code === 'auth/too-many-requests') {
        popup.error('Too many attempts. Please wait a moment and try again.');
      } else {
        popup.error(message || 'Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  /** Step 2: check the emailed code; only a correct code completes signup. */
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();

    const code = otp.trim();
    if (!/^\d{6}$/.test(code)) {
      popup.error('Enter the 6-digit code from your email.');
      return;
    }

    setLoading(true);
    const normalizedEmail = email.trim().toLowerCase();

    try {
      await verifySignupOtp({ email: normalizedEmail, code });

      const userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
      const user = userCredential.user;

      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: normalizedEmail,
        firstName,
        lastName,
        mobile,
        role: 'user',
        createdAt: new Date(),
      });

      popup.success('Registration successful!');
      navigate('/home');
    } catch (error) {
      // Signup is aborted on any throw - never store the user or navigate.
      const code_ = (error as { code?: string })?.code;
      const message = (error as { message?: string })?.message;
      if (code_ === 'functions/invalid-argument' || code_ === 'functions/not-found') {
        popup.error(message || 'Incorrect or expired code. Please try again.');
      } else if (code_ === 'functions/failed-precondition' || code_ === 'functions/resource-exhausted') {
        popup.error(message || 'Too many attempts. Please request a new code.');
      } else if (code_ === 'auth/email-already-in-use') {
        popup.error('An account with this email already exists. Please sign in instead.');
      } else if (code_ === 'auth/network-request-failed') {
        popup.error('Network error. Please check your connection and try again.');
      } else {
        popup.error(message || 'Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendIn > 0 || loading) return;
    setLoading(true);
    const normalizedEmail = email.trim().toLowerCase();
    try {
      await sendSignupOtp({ email: normalizedEmail });
      setOtp('');
      setResendIn(30);
      popup.success(`Verification code sent to ${normalizedEmail}.`);
    } catch (error) {
      const code = (error as { code?: string })?.code;
      const message = (error as { message?: string })?.message;
      if (code === 'functions/failed-precondition' || code === 'functions/resource-exhausted') {
        popup.error(message || 'Please wait a moment before requesting a new code.');
      } else {
        popup.error(message || 'Failed to resend the code. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBackToDetails = () => {
    setSignupStage('details');
    setOtp('');
    setResendIn(0);
  };

  const handleToggleMode = () => {
    setIsLogin((v) => !v);
    setSignupStage('details');
    setOtp('');
    setResendIn(0);
  };

  const handleForgotPassword = async () => {
    if (!email) {
      popup.error('Please enter your email address first');
      return;
    }

    try {
      setLoading(true);
      await sendPasswordResetMail({ email, baseUrl: window.location.origin });
      popup.success('Password reset email sent! Check your inbox.');
    } catch (error) {
      console.error('Error sending reset email:', error);
      const code = (error as { code?: string })?.code;
      const message = (error as { message?: string })?.message;
      if (code === 'functions/not-found' || code === 'auth/user-not-found') {
        popup.error('No account found with this email');
      } else {
        popup.error(message || 'Failed to send reset email');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex relative overflow-hidden bg-muted">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}></div>
      </div>

      {/* Left Panel - Hero Image */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        {/* Background Image - fills entire panel.
            WebP: same 909x910 art at ~160 kB instead of the PNG's 1.4 MB, so the
            preloaded hero arrives while the form is still rendering. */}
        <div
          className="absolute inset-0 w-full h-full bg-no-repeat"
          style={{
            backgroundImage: 'url("/images/jobslogo.webp")',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'brightness(0.8)'
          }}
        />

        {/* Title Overlay */}
        <div className="relative z-20 p-6 w-full">
          <h1 className="flex items-center gap-3 text-xl font-bold drop-shadow-lg text-surface">
            <img
              src="/images/indianinfra.png"
              alt="IndianInfra Logo"
              className="h-11 w-auto shrink-0 object-contain"
            />
            <span className="flex items-center gap-1">
              <span className="text-brand">Indian</span>
              <span>Infra Jobs</span>
            </span>
          </h1>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 relative overflow-hidden bg-muted/50">
        {/* Rich Glow & Pattern Background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">


          {/* Top Right Vibrant Glow (Orange/Pink) */}
          <div className="absolute -top-[30%] -right-[10%] w-[40%] h-[80%] rounded-full bg-brand/10 blur-3xl opacity-70 animate-pulse" style={{ animationDuration: '8s' }}></div>
          
          {/* Bottom Left Vibrant Glow (Blue/Primary) */}
          <div className="absolute -bottom-[30%] -left-[10%] w-[40%] h-[80%] rounded-full bg-brand/10 blur-3xl opacity-70"></div>
          
          {/* Middle Floating Accent */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[60%] rounded-full bg-brand/10 blur-3xl opacity-50"></div>
        </div>

        <div className="w-full max-w-md relative z-10">
          {/* Mobile Logo */}
          <div className="lg:hidden text-center mb-10 flex flex-col items-center">
            <div className="flex items-center gap-2 font-outfit text-3xl font-black tracking-tighter pr-1">
              <img
                src="/images/indianinfra.png"
                alt="IndianInfra Logo"
                className="h-10 w-auto object-contain"
              />
              <span className="text-ink">Indian Infra</span>
              <span className="text-brand">
                Jobs
              </span>
            </div>
          </div>

          {/* Form Card */}
          <div className="bg-surface rounded-2xl border border-border shadow-xl p-8 sm:p-10">
            <div className="text-center mb-6">
              <h2 className="text-2xl sm:text-3xl font-bold text-ink mb-1.5 tracking-tight">
                {isLogin ? (
                  <>Welcome <span className="text-brand">Back</span></>
                ) : signupStage === 'verify' ? (
                  <>Verify <span className="text-brand">Email</span></>
                ) : (
                  <>Join <span className="text-brand">Us</span></>
                )}
              </h2>
              <p className="text-ink/60 text-sm font-medium">
                {isLogin
                  ? 'Sign in to continue'
                  : signupStage === 'verify'
                    ? <>Enter the 6-digit code sent to <span className="text-ink font-semibold">{email.trim().toLowerCase()}</span></>
                    : 'Create your account to get started'}
              </p>
            </div>

            <form onSubmit={signupStage === 'verify' && !isLogin ? handleVerifyOtp : handleAuth} className="space-y-5">
              {!isLogin && signupStage === 'details' && (
                <div className="grid grid-cols-2 gap-4">
                  {/* First Name */}
                  <div className="relative group">
                    <input
                      type="text"
                      id="firstName"
                      className="peer w-full border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-ink focus:ring-1 focus:ring-brand/20 transition-all duration-200 bg-surface text-ink placeholder-transparent text-sm"
                      placeholder=" "
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                    />
                    <label
                      htmlFor="firstName"
                      className="absolute left-3 -top-2.5 bg-surface px-1 text-xs text-ink/60 transition-colors duration-200 pointer-events-none
                               peer-focus:text-brand"
                    >
                      First Name
                    </label>
                    <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink/40 peer-focus:text-brand transition-colors" />
                  </div>
                  {/* Last Name */}
                  <div className="relative group">
                    <input
                      type="text"
                      id="lastName"
                      className="peer w-full border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-ink focus:ring-1 focus:ring-brand/20 transition-all duration-200 bg-surface text-ink placeholder-transparent text-sm"
                      placeholder=" "
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                    />
                    <label
                      htmlFor="lastName"
                      className="absolute left-3 -top-2.5 bg-surface px-1 text-xs text-ink/60 transition-colors duration-200 pointer-events-none
                               peer-focus:text-brand"
                    >
                      Last Name
                    </label>
                    <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink/40 peer-focus:text-brand transition-colors" />
                  </div>
                </div>
              )}

              {!isLogin && signupStage === 'details' && (
                /* Mobile */
                <div className="relative group">
                  <input
                    type="tel"
                    id="mobile"
                    className="peer w-full border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-ink focus:ring-1 focus:ring-brand/20 transition-all duration-200 bg-surface text-ink placeholder-transparent text-sm"
                    placeholder=" "
                    required
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                  />
                  <label
                    htmlFor="mobile"
                    className="absolute left-3 -top-2.5 bg-surface px-1 text-xs text-ink/60 transition-colors duration-200 pointer-events-none
                             peer-focus:text-brand"
                  >
                    Mobile Number
                  </label>
                  <Phone className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink/40 peer-focus:text-brand transition-colors" />
                </div>
              )}

              {/* Email */}
              <div className="relative group">
                <input
                  type="email"
                  id="email"
                  className="peer w-full border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-ink focus:ring-1 focus:ring-brand/20 transition-all duration-200 bg-surface text-ink placeholder-transparent text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                  placeholder=" "
                  required
                  disabled={signupStage === 'verify' && !isLogin}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <label
                  htmlFor="email"
                  className="absolute left-3 -top-2.5 bg-surface px-1 text-xs text-ink/60 transition-colors duration-200 pointer-events-none
                           peer-focus:text-brand"
                >
                  Email Address
                </label>
                <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink/40 peer-focus:text-brand transition-colors" />
              </div>

              {/* Password (hidden during email verification) */}
              {(isLogin || signupStage === 'details') && (
                <div className="relative group">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    className="peer w-full border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-ink focus:ring-1 focus:ring-brand/20 transition-all duration-200 bg-surface text-ink placeholder-transparent text-sm"
                    placeholder=" "
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <label
                    htmlFor="password"
                    className="absolute left-3 -top-2.5 bg-surface px-1 text-xs text-ink/60 transition-colors duration-200 pointer-events-none
                             peer-focus:text-brand"
                  >
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink/60 hover:text-ink transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              )}

              {/* Verification code (signup step 2) */}
              {!isLogin && signupStage === 'verify' && (
                <>
                  <div className="relative group">
                    <input
                      type="text"
                      id="otp"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      className="peer w-full border border-border rounded-xl px-4 py-2.5 text-center text-lg font-mono tracking-[0.5em] focus:outline-none focus:border-ink focus:ring-1 focus:ring-brand/20 transition-all duration-200 bg-surface text-ink placeholder-transparent"
                      placeholder=" "
                      required
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    />
                    <label
                      htmlFor="otp"
                      className="absolute left-3 -top-2.5 bg-surface px-1 text-xs text-ink/60 transition-colors duration-200 pointer-events-none
                               peer-focus:text-brand"
                    >
                      Verification Code
                    </label>
                    <ShieldCheck className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink/40 peer-focus:text-brand transition-colors" />
                  </div>

                  <div className="flex items-center justify-between text-sm font-medium">
                    <button
                      type="button"
                      onClick={handleBackToDetails}
                      className="inline-flex items-center gap-1 text-ink/60 hover:text-ink transition-colors duration-200"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={resendIn > 0 || loading}
                      className="text-brand hover:text-ink disabled:text-ink/40 disabled:cursor-not-allowed transition-colors duration-200"
                    >
                      {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
                    </button>
                  </div>
                </>
              )}

              {isLogin && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-ink/60 hover:text-brand text-sm font-medium transition-colors duration-200"
                  >
                    Forgot Password?
                  </button>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full border border-ink bg-ink text-surface rounded-xl py-2.5 font-semibold text-base hover:border-ink/80 hover:bg-ink/80 hover:text-surface hover:shadow-xl hover:shadow-ink/20 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 sm:text-lg"
              >
                <div className="flex items-center justify-center gap-2">
                  {loading && <div className="w-4 h-4 border-2 border-surface/30 border-t-surface rounded-full animate-spin"></div>}
                  {isLogin ? 'Sign In' : signupStage === 'verify' ? 'Verify & Create Account' : 'Create Account'}
                </div>
              </button>

              {/* Toggle Auth Mode (hidden while verifying the code) */}
              {!(!isLogin && signupStage === 'verify') && (
                <p className="text-center text-sm text-ink/60 font-medium">
                  {isLogin ? (
                    <>
                      Don't have an account?{' '}
                      <button
                        type="button"
                        onClick={handleToggleMode}
                        className="text-brand hover:text-ink font-semibold transition-colors"
                      >
                        Sign up
                      </button>
                    </>
                  ) : (
                    <>
                      Already have an account?{' '}
                      <button
                        type="button"
                        onClick={handleToggleMode}
                        className="text-brand hover:text-ink font-semibold transition-colors"
                      >
                        Sign in
                      </button>
                    </>
                  )}
                </p>
              )}
            </form>
          </div>

          {/* Footer Text for Mobile */}
          <p className="text-center text-ink/60 text-sm mt-8 lg:hidden">
            © 2025 IndianInfra Jobs. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}