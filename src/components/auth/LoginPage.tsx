import { useState } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Mail, Phone, User, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [mobile, setMobile] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Fetch user data to check role
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          if (userData.role === 'manager' || userData.role === 'recruiter') {
            navigate('/dashboard');
          } else {
            navigate('/jobs');
          }
        } else {
          // If no doc exists, default to user view
          navigate('/jobs');
        }
        toast.success('Login successful!');
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Store user data in Firestore
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email,
          firstName,
          lastName,
          mobile,
          role: 'user',
          createdAt: new Date(),
        });

        toast.success('Registration successful!');
        navigate('/jobs');
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast.error('Please enter your email address first');
      return;
    }

    try {
      setLoading(true);
      await sendPasswordResetEmail(auth, email);
      toast.success('Password reset email sent! Check your inbox.');
    } catch (error: any) {
      console.error('Error sending reset email:', error);
      if (error.code === 'auth/user-not-found') {
        toast.error('No account found with this email');
      } else {
        toast.error(error.message || 'Failed to send reset email');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex relative overflow-hidden bg-gradient-to-br from-gray-50 via-white to-primary-50">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}></div>
      </div>

      {/* Left Panel - Hero Image with Overlay */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <style>
          {`
            @keyframes subtle-zoom {
              0% { transform: scale(1); }
              100% { transform: scale(1.1); }
            }
          `}
        </style>
        {/* Reduced overlay opacity for clearer image */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary-900/40 to-black/60 z-5"></div>
        <div
          className="absolute inset-0 w-full h-full bg-no-repeat"
          style={{
            backgroundImage: 'url("/images/job1.png")',
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        />

        {/* Content Overlay */}
        <div className="relative z-20 flex flex-col justify-between p-12 text-white w-full h-full text-center">
          {/* Logo/Brand */}
          <div className="flex flex-col items-center space-y-4 pt-20">
            <div className="p-1 bg-white/10 backdrop-blur-md rounded-full border border-white/20 shadow-xl">
              <img
                src="/images/indianinfra.png"
                alt="Indian Infra Logo"
                className="h-16 w-auto object-contain"
              />
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl font-extrabold tracking-tight">
                Indian Infra <span className="text-orange-500">Jobs</span>
              </h1>
              <p className="text-primary-100 text-lg font-medium tracking-wide">Your Gateway to Infrastructure Careers</p>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex flex-col items-center justify-center px-4 pb-50">
            <h2 className="text-3xl md:text-4xl font-bold leading-snug text-white drop-shadow-lg max-w-2xl">
              Continue building your future in Indian Infra
            </h2>
          </div>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 relative overflow-hidden bg-gray-50/50">
        {/* Rich Glow & Pattern Background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">


          {/* Top Right Vibrant Glow (Orange/Pink) */}
          <div className="absolute -top-[30%] -right-[10%] w-[40%] h-[80%] rounded-full bg-gradient-to-br from-orange-400/30 to-pink-500/30 blur-3xl opacity-70 animate-pulse" style={{ animationDuration: '8s' }}></div>
          
          {/* Bottom Left Vibrant Glow (Blue/Primary) */}
          <div className="absolute -bottom-[30%] -left-[10%] w-[40%] h-[80%] rounded-full bg-gradient-to-tr from-blue-400/30 to-primary-500/30 blur-3xl opacity-70"></div>
          
          {/* Middle Floating Accent */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[60%] rounded-full bg-gradient-to-r from-orange-100/40 to-primary-100/40 blur-3xl opacity-50"></div>
        </div>

        <div className="w-full max-w-md relative z-10">
          {/* Mobile Logo */}
          <div className="lg:hidden text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900">
              Indian Infra <span className="text-primary-600">Jobs</span>
            </h1>
            <p className="text-gray-500 text-sm mt-1">Your Gateway to Infrastructure Careers</p>
          </div>

          {/* Form Card */}
          <div className="backdrop-blur-xl bg-white/95 rounded-3xl shadow-lg border border-gray-100 p-8 sm:p-10">
            <div className="text-center mb-6">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1.5 tracking-tight">
                {isLogin ? (
                  <>Welcome <span className="bg-gradient-to-r from-primary-600 to-orange-500 bg-clip-text text-transparent">Back</span></>
                ) : (
                  <>Join <span className="bg-gradient-to-r from-primary-600 to-orange-500 bg-clip-text text-transparent">Us</span></>
                )}
              </h2>
              <p className="text-gray-500 text-sm font-medium">
                {isLogin ? 'Sign in to continue' : 'Create your account to get started'}
              </p>
            </div>

            <form onSubmit={handleAuth} className="space-y-5">
              {!isLogin && (
                <div className="grid grid-cols-2 gap-4">
                  {/* First Name */}
                  <div className="relative group">
                    <input
                      type="text"
                      id="firstName"
                      className="peer w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600 transition-all duration-200 bg-white/50 text-gray-900 placeholder-transparent text-sm"
                      placeholder=" "
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                    />
                    <label
                      htmlFor="firstName"
                      className="absolute left-3 -top-2.5 bg-white px-1 text-xs text-gray-500 transition-colors duration-200 pointer-events-none
                               peer-focus:text-primary-600"
                    >
                      First Name
                    </label>
                    <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 peer-focus:text-primary-600 transition-colors" />
                  </div>
                  {/* Last Name */}
                  <div className="relative group">
                    <input
                      type="text"
                      id="lastName"
                      className="peer w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600 transition-all duration-200 bg-white/50 text-gray-900 placeholder-transparent text-sm"
                      placeholder=" "
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                    />
                    <label
                      htmlFor="lastName"
                      className="absolute left-3 -top-2.5 bg-white px-1 text-xs text-gray-500 transition-colors duration-200 pointer-events-none
                               peer-focus:text-primary-600"
                    >
                      Last Name
                    </label>
                    <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 peer-focus:text-primary-600 transition-colors" />
                  </div>
                </div>
              )}

              {!isLogin && (
                /* Mobile */
                <div className="relative group">
                  <input
                    type="tel"
                    id="mobile"
                    className="peer w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600 transition-all duration-200 bg-white/50 text-gray-900 placeholder-transparent text-sm"
                    placeholder=" "
                    required
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                  />
                  <label
                    htmlFor="mobile"
                    className="absolute left-3 -top-2.5 bg-white px-1 text-xs text-gray-500 transition-colors duration-200 pointer-events-none
                             peer-focus:text-primary-600"
                  >
                    Mobile Number
                  </label>
                  <Phone className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 peer-focus:text-primary-600 transition-colors" />
                </div>
              )}

              {/* Email */}
              <div className="relative group">
                <input
                  type="email"
                  id="email"
                  className="peer w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600 transition-all duration-200 bg-white/50 text-gray-900 placeholder-transparent text-sm"
                  placeholder=" "
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <label
                  htmlFor="email"
                  className="absolute left-3 -top-2.5 bg-white px-1 text-xs text-gray-500 transition-colors duration-200 pointer-events-none
                           peer-focus:text-primary-600"
                >
                  Email Address
                </label>
                <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 peer-focus:text-primary-600 transition-colors" />
              </div>

              {/* Password */}
              <div className="relative group">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  className="peer w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600 transition-all duration-200 bg-white/50 text-gray-900 placeholder-transparent text-sm"
                  placeholder=" "
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <label
                  htmlFor="password"
                  className="absolute left-3 -top-2.5 bg-white px-1 text-xs text-gray-500 transition-colors duration-200 pointer-events-none
                           peer-focus:text-primary-600"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-primary-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {isLogin && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-gray-500 hover:text-primary-600 text-sm font-medium transition-colors duration-200"
                  >
                    Forgot Password?
                  </button>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-primary-600 to-orange-500 text-white rounded-xl py-2.5 font-semibold text-base shadow-lg shadow-primary-500/25 hover:shadow-xl hover:shadow-primary-500/30 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 sm:text-lg"
              >
                {loading ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Processing...
                  </div>
                ) : (
                  isLogin ? 'Sign In' : 'Create Account'
                )}
              </button>

              {/* Toggle Auth Mode */}
              <p className="text-center text-sm text-gray-500 font-medium">
                {isLogin ? (
                  <>
                    Don't have an account?{' '}
                    <button
                      type="button"
                      onClick={() => setIsLogin(false)}
                      className="text-primary-600 hover:text-primary-700 font-semibold transition-colors"
                    >
                      Sign up
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => setIsLogin(true)}
                      className="text-primary-600 hover:text-primary-700 font-semibold transition-colors"
                    >
                      Sign in
                    </button>
                  </>
                )}
              </p>
            </form>
          </div>

          {/* Footer Text for Mobile */}
          <p className="text-center text-gray-500 text-sm mt-8 lg:hidden">
            © 2025 Indian Infra Jobs. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}