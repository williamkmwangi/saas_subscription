import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { api } from '../utils/api';
import { formatCurrency, formatDate, formatSubscriptionStatus } from '../utils/format';
import toast from 'react-hot-toast';

interface Subscription {
  id: string;
  status: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  trialEnd: string | null;
  plan: {
    name: string;
    price: number;
    currency: string;
    interval: string;
    features: string[];
  };
}

interface Invoice {
  id: string;
  amount: number;
  currency: string;
  status: string;
  hostedInvoiceUrl: string | null;
  createdAt: string;
}

export default function Billing() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [subRes, invRes] = await Promise.all([
        api.get('/subscriptions/current'),
        api.get('/subscriptions/invoices'),
      ]);
      setSubscription(subRes.data.data);
      setInvoices(invRes.data.data);
    } catch (error) {
      console.error('Failed to fetch billing data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleManageBilling = async () => {
    setIsProcessing(true);
    try {
      const response = await api.post('/subscriptions/billing-portal', {
        returnUrl: window.location.href,
      });
      window.location.href = response.data.data.url;
    } catch (error) {
      toast.error('Failed to open billing portal');
      setIsProcessing(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel your subscription? You will still have access until the end of your billing period.')) {
      return;
    }
    
    setIsProcessing(true);
    try {
      await api.post('/subscriptions/cancel');
      toast.success('Subscription cancelled successfully');
      fetchData();
    } catch (error) {
      toast.error('Failed to cancel subscription');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResume = async () => {
    setIsProcessing(true);
    try {
      await api.post('/subscriptions/resume');
      toast.success('Subscription resumed successfully');
      fetchData();
    } catch (error) {
      toast.error('Failed to resume subscription');
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const status = subscription ? formatSubscriptionStatus(subscription.status) : null;

  return (
    <>
      <Helmet>
        <title>Billing - SaaS Demo</title>
      </Helmet>

      <div className="space-y-8">
        <h1 className="text-2xl font-bold text-gray-900">Billing</h1>

        {/* Current Plan */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Current Plan</h2>
          
          {subscription ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center space-x-3">
                    <span className="text-xl font-bold text-gray-900">{subscription.plan.name}</span>
                    {status && (
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-${status.color}-100 text-${status.color}-800`}>
                        {status.text}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-gray-600">
                    {formatCurrency(subscription.plan.price, subscription.plan.currency)}/{subscription.plan.interval}
                  </p>
                </div>
                <button
                  onClick={handleManageBilling}
                  disabled={isProcessing}
                  className="btn-secondary"
                >
                  Manage Payment Method
                </button>
              </div>

              {subscription.trialEnd && new Date(subscription.trialEnd) > new Date() && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    Your trial ends on <strong>{formatDate(subscription.trialEnd)}</strong>
                  </p>
                </div>
              )}

              {subscription.cancelAtPeriodEnd ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm text-yellow-800">
                    Your subscription will be cancelled on <strong>{formatDate(subscription.currentPeriodEnd)}</strong>
                  </p>
                  <button
                    onClick={handleResume}
                    disabled={isProcessing}
                    className="mt-2 text-sm font-medium text-yellow-800 hover:text-yellow-900"
                  >
                    Resume subscription
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleCancel}
                  disabled={isProcessing}
                  className="text-sm text-red-600 hover:text-red-500"
                >
                  Cancel subscription
                </button>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-600 mb-4">You don't have an active subscription</p>
              <a href="/pricing" className="btn-primary">
                View Plans
              </a>
            </div>
          )}
        </div>

        {/* Invoice History */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Invoice History</h2>
          {invoices.length > 0 ? (
            <div className="card overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(invoice.createdAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(invoice.amount, invoice.currency)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          invoice.status === 'paid' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {invoice.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {invoice.hostedInvoiceUrl && (
                          <a
                            href={invoice.hostedInvoiceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary-600 hover:text-primary-900"
                          >
                            View Invoice
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card p-6 text-center">
              <p className="text-gray-600">No invoices yet</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
