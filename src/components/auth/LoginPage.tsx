import { useState } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Mail, Phone, User, Eye, EyeOff, Briefcase, TrendingUp, Users, Award } from 'lucide-react';

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

  return (
    <div className="min-h-screen flex relative overflow-hidden bg-gradient-to-br from-gray-50 via-white to-primary-50">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}></div>
      </div>

      {/* Left Panel - Hero Image with Overlay */}
      <div className="hidden lg:flex lg:w-1/2 relative">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-600/95 to-primary-800/95 z-10"></div>
        <img
          src="/images/hero-bg.png"
          alt="Professionals collaborating"
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Content Overlay */}
        <div className="relative z-20 flex flex-col justify-between p-12 text-white w-full">
          {/* Logo/Brand */}
          <div className="space-y-2">
            <h1 className="text-3xl font-bold">
              Indian Infra <span className="text-orange-300">Jobs</span>
            </h1>
            <p className="text-primary-100 text-sm">Your Gateway to Infrastructure Careers</p>
          </div>

          {/* Main Content */}
          <div className="space-y-8">
            {isLogin ? (
              <>
                <div className="space-y-4">
                  <h2 className="text-4xl md:text-5xl font-bold leading-tight">
                    Welcome Back to Your Career Journey
                  </h2>
                  <p className="text-lg text-primary-100 max-w-md">
                    Continue building your future in Indian Infra sector. Your next opportunity awaits.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-4">
                  <h2 className="text-4xl md:text-5xl font-bold leading-tight">
                    Start Your Career Journey Today
                  </h2>
                  <p className="text-lg text-primary-100 max-w-md">
                    Join thousands of professionals building India's infrastructure future.
                  </p>
                </div>
              </>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 gap-6 max-w-md">
              <div className="backdrop-blur-sm bg-white/10 rounded-xl p-4 border border-white/20">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-orange-400/20 rounded-lg">
                    <Briefcase className="w-5 h-5 text-orange-300" />
                  </div>
                  <p className="text-2xl font-bold">1000+</p>
                </div>
                <p className="text-sm text-primary-100">Active Jobs</p>
              </div>
              <div className="backdrop-blur-sm bg-white/10 rounded-xl p-4 border border-white/20">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-orange-400/20 rounded-lg">
                    <Users className="w-5 h-5 text-orange-300" />
                  </div>
                  <p className="text-2xl font-bold">5000+</p>
                </div>
                <p className="text-sm text-primary-100">Professionals</p>
              </div>
              <div className="backdrop-blur-sm bg-white/10 rounded-xl p-4 border border-white/20">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-orange-400/20 rounded-lg">
                    <TrendingUp className="w-5 h-5 text-orange-300" />
                  </div>
                  <p className="text-2xl font-bold">95%</p>
                </div>
                <p className="text-sm text-primary-100">Success Rate</p>
              </div>
              <div className="backdrop-blur-sm bg-white/10 rounded-xl p-4 border border-white/20">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-orange-400/20 rounded-lg">
                    <Award className="w-5 h-5 text-orange-300" />
                  </div>
                  <p className="text-2xl font-bold">500+</p>
                </div>
                <p className="text-sm text-primary-100">Companies</p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-primary-100 text-sm">
            © 2025 Indian Infra Jobs. All rights reserved.
          </div>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 relative z-10">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900">
              Indian Infra <span className="text-primary-600">Jobs</span>
            </h1>
            <p className="text-gray-500 text-sm mt-1">Your Gateway to Infrastructure Careers</p>
          </div>

          {/* Form Card */}
          <div className="backdrop-blur-xl bg-white/80 rounded-3xl shadow-2xl border border-gray-100 p-8 sm:p-10">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">
                {isLogin ? (
                  <>Welcome <span className="bg-gradient-to-r from-primary-600 to-orange-500 bg-clip-text text-transparent">Back</span></>
                ) : (
                  <>Join <span className="bg-gradient-to-r from-primary-600 to-orange-500 bg-clip-text text-transparent">Us</span></>
                )}
              </h2>
              <p className="text-gray-500">
                {isLogin ? 'Sign in to continue your journey' : 'Create your account to get started'}
              </p>
            </div>

            <form onSubmit={handleAuth} className="space-y-5">
              {!isLogin && (
                <div className="grid grid-cols-2 gap-4">
                  {/* First Name */}
                  <div className="relative group">
                    <input
                      type="text"
                      placeholder="First Name"
                      className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 pr-10 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition-all duration-200 bg-white/50"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                    />
                    <User className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-focus-within:text-primary-500 transition-colors" />
                  </div>
                  {/* Last Name */}
                  <div className="relative group">
                    <input
                      type="text"
                      placeholder="Last Name"
                      className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 pr-10 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition-all duration-200 bg-white/50"
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                    />
                    <User className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-focus-within:text-primary-500 transition-colors" />
                  </div>
                </div>
              )}

              {!isLogin && (
                /* Mobile */
                <div className="relative group">
                  <input
                    type="tel"
                    placeholder="Mobile Number"
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 pr-10 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition-all duration-200 bg-white/50"
                    required
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                  />
                  <Phone className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-focus-within:text-primary-500 transition-colors" />
                </div>
              )}

              {/* Email */}
              <div className="relative group">
                <input
                  type="email"
                  placeholder="Email Address"
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 pr-10 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition-all duration-200 bg-white/50"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-focus-within:text-primary-500 transition-colors" />
              </div>

              {/* Password */}
              <div className="relative group">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 pr-10 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition-all duration-200 bg-white/50"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-primary-500 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>

              {isLogin && (
                <div className="flex justify-end">
                  <button type="button" className="text-primary-600 hover:text-primary-700 text-sm font-medium transition-colors">
                    Forgot Password?
                  </button>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-primary-600 to-orange-500 text-white rounded-xl py-3.5 font-semibold text-lg shadow-lg shadow-primary-500/30 hover:shadow-xl hover:shadow-primary-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {loading ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Processing...
                  </div>
                ) : (
                  isLogin ? 'Sign In' : 'Create Account'
                )}
              </button>

              {/* Toggle Auth Mode */}
              <p className="text-center text-sm text-gray-600">
                {isLogin ? (
                  <>
                    Don't have an account?{' '}
                    <button
                      type="button"
                      onClick={() => setIsLogin(false)}
                      className="text-primary-600 hover:text-primary-700 font-semibold transition-colors"
                    >
                      Sign up for free
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