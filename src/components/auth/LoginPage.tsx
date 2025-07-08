// React component

import { useState } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
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
        await signInWithEmailAndPassword(auth, email, password);
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
          role: 'recruiter',
          createdAt: new Date(),
        });
        
        toast.success('Registration successful!');
      }
      navigate('/dashboard');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden md:flex md:w-1/2 bg-primary-600 text-white flex-col items-center justify-center px-14 text-center space-y-4">
        {isLogin ? (
          <>
            <h1 className="text-4xl font-extrabold">Welcome Back!</h1>
            <p className="max-w-xs text-lg">To keep connected with us please login with your credentials.</p>
          </>
        ) : (
          <>
            <h1 className="text-4xl font-extrabold">Welcome!</h1>
            <p className="max-w-xs text-lg">Enter your personal details and start your journey with us.</p>
          </>
        )}
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center bg-gray-50 py-12 px-6 sm:px-12">
        <div className="w-full max-w-md">
          {isLogin ? (
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold">
                Welcome <span className="text-primary-600">Back</span>
              </h1>
            </div>
          ) : (
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold">
                Join us <span className="text-primary-600">today</span>
              </h1>
            </div>
          )}

          {/* Spacer */}
          <div className="mb-6" />

          <form onSubmit={handleAuth} className="space-y-4">
            {!isLogin && (
              <div className="grid grid-cols-1 gap-4">
                {/* First Name */}
                <div className="relative">
                  <input
                    type="text"
                    placeholder="First Name"
                    className="w-full border rounded-md px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-primary-600"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                  <User className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                </div>
                {/* Last Name */}
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Last Name"
                    className="w-full border rounded-md px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-primary-600"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                  <User className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                </div>
                {/* Mobile */}
                <div className="relative">
                  <input
                    type="tel"
                    placeholder="Mobile"
                    className="w-full border rounded-md px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-primary-600"
                    required
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                  />
                  <Phone className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                </div>
              </div>
            )}

            {/* Email */}
            <div className="relative">
              <input
                type="email"
                placeholder="Email"
                className="w-full border rounded-md px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-primary-600"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            </div>

            {/* Password */}
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                className="w-full border rounded-md px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-primary-600"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>

            {isLogin && (
              <div className="text-center mb-2">
                <button type="button" className="text-primary-600 hover:underline text-sm">Forgot Password?</button>
              </div>
            )}

            <div className="flex justify-center">
              <button
                type="submit"
                disabled={loading}
                className="px-10 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition disabled:opacity-50"
              >
                {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Sign Up')}
              </button>
            </div>

            <p className="text-center text-sm">
              {isLogin ? (
                <>Don&apos;t have an account?{' '}
                <button type="button" onClick={() => setIsLogin(false)} className="text-primary-600 hover:underline">Sign up</button></>
              ) : (
                <>Already have an account?{' '}
                <button type="button" onClick={() => setIsLogin(true)} className="text-primary-600 hover:underline">Sign in</button></>
              )}
            </p>
          </form>
        </div>
      </div>
    </div>
  );
} 