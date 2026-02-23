import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { api } from '../utils/api';
import toast from 'react-hot-toast';

export default function ForgotPassword() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [email, setEmail] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await api.post('/auth/forgot-password', { email });
      setIsSent(true);
      toast.success('Password reset email sent');
    } catch {
      // Always show success to prevent email enumeration
      setIsSent(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSent) {
    return (
      <>
        <Helmet>
          <title>Check Your Email - SaaS Demo</title>
        </Helmet>
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center py-12 px-4">
          <div className="max-w-md w-full text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="mt-6 text-3xl font-bold text-gray-900">Check your email</h2>
            <p className="mt-2 text-gray-600">
              If an account exists for {email}, we've sent password reset instructions.
            </p>
            <Link to="/login" className="mt-6 inline-block text-primary-600 hover:text-primary-500">
              Back to sign in
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>Forgot Password - SaaS Demo</title>
      </Helmet>
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center py-12 px-4">
        <div className="max-w-md w-full">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900">Forgot password?</h2>
            <p className="mt-2 text-gray-600">
              Enter your email and we'll send you reset instructions.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            <div>
              <label htmlFor="email" className="label">Email address</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="you@example.com"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full btn-primary py-3 disabled:opacity-50"
            >
              {isSubmitting ? 'Sending...' : 'Send reset instructions'}
            </button>
          </form>

          <p className="mt-4 text-center text-sm">
            <Link to="/login" className="text-primary-600 hover:text-primary-500">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
