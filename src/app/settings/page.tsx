import { Navbar } from '@/components/layout/Navbar'

export default function Settings() {
  return (
    <>
      <Navbar />
      <div className="pt-24 pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white shadow sm:rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg font-medium leading-6 text-gray-900">Settings</h3>
              <div className="mt-5 space-y-6">
                {/* Language Settings */}
                <div>
                  <label htmlFor="language" className="block text-sm font-medium text-gray-700">
                    Language
                  </label>
                  <select
                    id="language"
                    name="language"
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm rounded-md"
                    defaultValue="en"
                  >
                    <option value="en">English</option>
                    <option value="nl">Nederlands</option>
                    <option value="zh">中文</option>
                  </select>
                </div>

                {/* Auto-delete Settings */}
                <div className="flex items-start">
                  <div className="flex items-center h-5">
                    <input
                      id="auto-delete"
                      name="auto-delete"
                      type="checkbox"
                      className="focus:ring-primary-500 h-4 w-4 text-primary-600 border-gray-300 rounded"
                    />
                  </div>
                  <div className="ml-3 text-sm">
                    <label htmlFor="auto-delete" className="font-medium text-gray-700">
                      Auto-delete processed invoices
                    </label>
                    <p className="text-gray-500">
                      Automatically delete processed invoices after 30 days to save storage space.
                    </p>
                  </div>
                </div>

                {/* Save Button */}
                <div>
                  <button
                    type="button"
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
} 