import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { api } from '../utils/api';
import { formatCurrency, formatDate, formatSubscriptionStatus } from '../utils/format';
import type { UserDashboard } from '@shared/types';

export default function Dashboard() {
  const [data, setData] = useState<UserDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      const response = await api.get('/dashboard');
      setData(response.data.data);
    } catch (error) {
      console.error('Failed to fetch dashboard:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Failed to load dashboard data</p>
      </div>
    );
  }

  const { user, subscription, usage, recentInvoices } = data;
  const status = subscription ? formatSubscriptionStatus(subscription.status) : null;

  return (
    <>
      <Helmet>
        <title>Dashboard - SaaS Demo</title>
      </Helmet>

      <div className="space-y-8">
        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {user.firstName}!
          </h1>
          <p className="mt-1 text-gray-600">
            Here's what's happening with your account
          </p>
        </div>

        {/* Subscription Status */}
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Current Plan</h2>
              {subscription ? (
                <div className="mt-2">
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl font-bold text-gray-900">
                      {subscription.plan.name}
                    </span>
                    {status && (
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-${status.color}-100 text-${status.color}-800`}>
                        {status.text}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-gray-600">
                    {formatCurrency(subscription.plan.price)}/{subscription.plan.interval}
                  </p>
                  {subscription.trialEnd && new Date(subscription.trialEnd) > new Date() && (
                    <p className="mt-1 text-sm text-primary-600">
                      Trial ends on {formatDate(subscription.trialEnd)}
                    </p>
                  )}
                  {subscription.cancelAtPeriodEnd && (
                    <p className="mt-1 text-sm text-red-600">
                      Cancels on {formatDate(subscription.currentPeriodEnd)}
                    </p>
                  )}
                </div>
              ) : (
                <div className="mt-2">
                  <p className="text-gray-600">You don't have an active subscription</p>
                  <Link to="/pricing" className="mt-2 inline-flex text-primary-600 hover:text-primary-500">
                    View plans →
                  </Link>
                </div>
              )}
            </div>
            <Link
              to="/dashboard/billing"
              className="btn-secondary"
            >
              Manage Billing
            </Link>
          </div>
        </div>

        {/* Usage */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Usage This Month</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {usage.map((item) => (
              <div key={item.key} className="card p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-600">{item.metric}</span>
                  {!item.unlimited && (
                    <span className="text-sm text-gray-500">
                      {item.percentage}%
                    </span>
                  )}
                </div>
                <div className="mt-2">
                  <span className="text-2xl font-bold text-gray-900">
                    {item.unlimited ? '∞' : item.current.toLocaleString()}
                  </span>
                  {!item.unlimited && (
                    <span className="text-gray-500 text-sm">
                      {' '}/ {item.limit.toLocaleString()}
                    </span>
                  )}
                </div>
                {!item.unlimited && (
                  <div className="mt-3 w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        item.percentage > 80 ? 'bg-red-500' : 'bg-primary-600'
                      }`}
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Recent Invoices */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent Invoices</h2>
            <Link to="/dashboard/billing" className="text-sm text-primary-600 hover:text-primary-500">
              View all
            </Link>
          </div>
          {recentInvoices.length > 0 ? (
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
                  {recentInvoices.map((invoice) => (
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
                            View
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
