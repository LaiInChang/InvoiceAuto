import { Navbar } from '@/components/layout/Navbar'
import { ArrowDownTrayIcon, ArrowPathIcon } from '@heroicons/react/24/outline'

export default function Results() {
  return (
    <>
      <Navbar />
      <div className="pt-24 pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Summary Card */}
          <div className="bg-white shadow sm:rounded-lg mb-8">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg font-medium leading-6 text-gray-900">Processing Results</h3>
              <div className="mt-5">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center">
                    <span className="text-2xl">✅</span>
                    <span className="ml-2 text-lg font-medium text-green-600">25 Success</span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-2xl">❌</span>
                    <span className="ml-2 text-lg font-medium text-red-600">5 Failed</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Download Options */}
          <div className="bg-white shadow sm:rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg font-medium leading-6 text-gray-900">Download Results</h3>
              <div className="mt-5">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">Excel Summary</h4>
                      <p className="text-sm text-gray-500">Contains all successfully processed invoices</p>
                    </div>
                    <button
                      type="button"
                      disabled
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
                      Download
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg">
                    <div>
                      <h4 className="text-sm font-medium text-red-900">Failed Invoices</h4>
                      <p className="text-sm text-red-500">5 invoices need attention</p>
                    </div>
                    <button
                      type="button"
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                    >
                      <ArrowPathIcon className="h-5 w-5 mr-2" />
                      Retry Failed
                    </button>
                  </div>
                </div>
              </div>
              <div className="mt-5 sm:mt-6">
                <a
                  href="/dashboard"
                  className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                >
                  Return to Dashboard
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
} 