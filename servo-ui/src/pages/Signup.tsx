import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAppStore } from '../store';
import { UserPlus, Key, Mail, AlertCircle, Loader2 } from 'lucide-react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';

const Signup = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const setAuth = useAppStore((state) => state.setAuth);
  const navigate = useNavigate();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const token = await userCredential.user.getIdToken();
      setAuth({ id: userCredential.user.uid, email: userCredential.user.email! }, token);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Failed to sign up');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Brand radial glow effect */}
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-brand-softer rounded-full blur-[120px] opacity-50 -z-10 translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>

      <div className="w-full max-w-md bg-neutral-primary-soft rounded-[12px] shadow-xl border border-default transform transition-all">
        <div className="p-8 text-center border-b border-default relative overflow-hidden">
          <div className="w-16 h-16 bg-neutral-primary-strong rounded-[12px] flex items-center justify-center mx-auto mb-5 border border-default-medium">
            <UserPlus className="w-8 h-8 text-fg-brand" />
          </div>
          <h2 className="text-2xl font-semibold text-heading relative z-10 tracking-tight">Create Account</h2>
          <p className="text-body mt-2 text-sm relative z-10">Start building your architectures</p>
        </div>

        <form onSubmit={handleSignup} className="p-8 space-y-6">
          {error && (
            <div className="bg-danger-soft text-fg-danger p-4 rounded-[12px] flex items-center gap-3 text-sm border border-danger-subtle">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-heading mb-2">Email Address</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-body-subtle group-focus-within:text-fg-brand transition-colors" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-11 w-full px-4 py-2.5 bg-neutral-primary border border-default text-body rounded-[12px] focus:bg-neutral-primary-soft focus:ring-1 focus:ring-brand-medium focus:border-brand-medium outline-none transition-all duration-300 placeholder:text-body-subtle shadow-xs"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-heading mb-2">Password</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Key className="h-5 w-5 text-body-subtle group-focus-within:text-fg-brand transition-colors" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-11 w-full px-4 py-2.5 bg-neutral-primary border border-default text-body rounded-[12px] focus:bg-neutral-primary-soft focus:ring-1 focus:ring-brand-medium focus:border-brand-medium outline-none transition-all duration-300 placeholder:text-body-subtle shadow-xs"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-heading mb-2">Confirm Password</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Key className="h-5 w-5 text-body-subtle group-focus-within:text-fg-brand transition-colors" />
                </div>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-11 w-full px-4 py-2.5 bg-neutral-primary border border-default text-body rounded-[12px] focus:bg-neutral-primary-soft focus:ring-1 focus:ring-brand-medium focus:border-brand-medium outline-none transition-all duration-300 placeholder:text-body-subtle shadow-xs"
                  placeholder="••••••••"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand hover:bg-brand-strong text-white font-medium py-[10px] px-4 rounded-[12px] transition-all duration-300 flex items-center justify-center gap-2 shadow-xs disabled:opacity-70 disabled:cursor-not-allowed border border-transparent focus:ring-4 focus:ring-brand-medium focus:outline-none"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create Account'}
          </button>

          <p className="text-center text-[13px] text-body-subtle mt-8">
            Already have an account?{' '}
            <Link to="/login" className="text-fg-brand font-medium hover:text-fg-brand-strong hover:underline transition-colors">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default Signup;
