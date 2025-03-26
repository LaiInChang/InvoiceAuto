import { Navbar } from '@/components/layout/Navbar'
import { CloudArrowUpIcon } from '@heroicons/react/24/outline'

export default function Dashboard() {
  return (
    <>
      <Navbar />
      <div className="pt-24 pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Credit Balance */}
          <div className="mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-medium text-gray-900">Credit Balance</h2>
              <p className="mt-2 text-3xl font-bold text-primary-600">1,250 credits</p>
            </div>
          </div>

          {/* Upload Area */}
          <div className="mb-8">
            <div className="bg-white rounded-lg shadow p-8 border-2 border-dashed border-gray-300">
              <div className="text-center">
                <CloudArrowUpIcon className="mx-auto h-12 w-12 text-gray-400" />
                <div className="mt-4">
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <span className="mt-2 block text-sm font-semibold text-primary-600">
                      Upload your invoices
                    </span>
                    <span className="mt-1 block text-sm text-gray-500">
                      Drag and drop your files here, or click to select files
                    </span>
                  </label>
                  <input id="file-upload" name="file-upload" type="file" className="sr-only" multiple />
                </div>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Processing Invoices</span>
                <span className="text-sm font-medium text-gray-700">8/30</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div className="bg-primary-600 h-2.5 rounded-full" style={{ width: '26.67%' }}></div>
              </div>
              <p className="mt-2 text-sm text-gray-500">Extracting invoice 8/30...</p>
            </div>
          </div>

          {/* Recent Uploads */}
          <div>
            <h2 className="text-lg font-medium text-gray-900 mb-4">Recent Uploads</h2>
            <div className="bg-white shadow overflow-hidden sm:rounded-md">
              <ul className="divide-y divide-gray-200">
                {[1, 2, 3].map((item) => (
                  <li key={item}>
                    <div className="px-4 py-4 sm:px-6 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <div className="flex-shrink-0">
                            <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                          <div className="ml-4">
                            <p className="text-sm font-medium text-primary-600">invoice_{item}.pdf</p>
                            <p className="text-sm text-gray-500">Uploaded 2 hours ago</p>
                          </div>
                        </div>
                        <div className="flex items-center">
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                            Processed
                          </span>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </>
  )
} 