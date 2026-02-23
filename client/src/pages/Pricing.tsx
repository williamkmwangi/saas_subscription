import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { api } from '../utils/api';
import { formatCurrency, formatInterval } from '../utils/format';
import { useAuthStore } from '../store/authStore';
import type { Plan } from '@shared/types';

export default function Pricing() {
  const { isAuthenticated } = useAuthStore();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [billingInterval, setBillingInterval] = useState<'month' | 'year'>('month');

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const response = await api.get('/plans');
      setPlans(response.data.data);
    } catch (error) {
      console.error('Failed to fetch plans:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredPlans = plans.filter(plan => 
    billingInterval === 'month' ? plan.interval === 'month' : plan.interval === 'year'
  );

  return (
    <>
      <Helmet>
        <title>Pricing - SaaS Demo</title>
      </Helmet>

      <div className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-900">Simple, transparent pricing</h1>
            <p className="mt-4 text-xl text-gray-600">Choose the plan that's right for you</p>

            {/* Billing toggle */}
            <div className="mt-8 flex justify-center items-center space-x-4">
              <span className={`text-sm ${billingInterval === 'month' ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                Monthly
              </span>
              <button
                onClick={() => setBillingInterval(billingInterval === 'month' ? 'year' : 'month')}
                className="relative inline-flex h-6 w-11 items-center rounded-full bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    billingInterval === 'year' ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className={`text-sm ${billingInterval === 'year' ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                Yearly
                <span className="ml-1 text-primary-600">(Save 17%)</span>
              </span>
            </div>
          </div>

          {isLoading ? (
            <div className="mt-16 flex justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
          ) : (
            <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {filteredPlans.map((plan) => (
                <div
                  key={plan.id}
                  className={`card p-6 flex flex-col ${plan.name === 'Pro' ? 'ring-2 ring-primary-500' : ''}`}
                >
                  {plan.name === 'Pro' && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800 mb-4 w-fit">
                      Most Popular
                    </span>
                  )}
                  <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
                  <p className="mt-2 text-sm text-gray-500">{plan.description}</p>
                  <div className="mt-4">
                    <span className="text-4xl font-bold text-gray-900">
                      {plan.price === 0 ? 'Free' : formatCurrency(plan.price)}
                    </span>
                    {plan.price > 0 && (
                      <span className="text-gray-500">/{formatInterval(plan.interval)}</span>
                    )}
                  </div>
                  {plan.trialDays > 0 && (
                    <p className="mt-2 text-sm text-primary-600">{plan.trialDays}-day free trial</p>
                  )}
                  <ul className="mt-6 space-y-3 flex-1">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-start">
                        <svg className="h-5 w-5 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="ml-3 text-sm text-gray-600">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-8">
                    {isAuthenticated ? (
                      <Link
                        to="/dashboard/billing"
                        className={`w-full btn ${plan.name === 'Pro' ? 'btn-primary' : 'btn-secondary'}`}
                      >
                        {plan.price === 0 ? 'Current Plan' : 'Subscribe'}
                      </Link>
                    ) : (
                      <Link
                        to="/register"
                        className={`w-full btn ${plan.name === 'Pro' ? 'btn-primary' : 'btn-secondary'}`}
                      >
                        Get Started
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
