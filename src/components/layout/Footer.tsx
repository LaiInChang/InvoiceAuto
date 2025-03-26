'use client'

import Image from 'next/image'
import Link from 'next/link'

export function Footer() {
  return (
    <footer className="bg-white border-t mt-auto">
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Logo and Company Info */}
          <div className="flex flex-col items-center md:items-start">
            <div className="flex items-center space-x-3">
              <Image
                src="/vlisoft-logo.png"
                alt="VliSoft Logo"
                width={50}
                height={50}
                className="rounded-full"
              />
              <div>
                <h3 className="text-lg font-semibold text-gray-900">VliSoft</h3>
                <p className="text-sm text-gray-500">Empowering Business Through Technology</p>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="text-center md:text-left">
            <h3 className="text-sm font-semibold text-gray-900 tracking-wider uppercase">Quick Links</h3>
            <ul className="mt-2 space-y-2">
              <li>
                <Link href="http://vlisoft.com" className="text-sm text-gray-500 hover:text-gray-900">
                  Company Website
                </Link>
              </li>
              <li>
                <Link href="/about" className="text-sm text-gray-500 hover:text-gray-900">
                  About Us
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-sm text-gray-500 hover:text-gray-900">
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact Info */}
          <div className="text-center md:text-left">
            <h3 className="text-sm font-semibold text-gray-900 tracking-wider uppercase">Contact Us</h3>
            <ul className="mt-2 space-y-2">
              <li className="text-sm text-gray-500">
                <a href="mailto:info@vlisoft.com" className="hover:text-gray-900">
                  info@vlisoft.com
                </a>
              </li>
              <li className="text-sm text-gray-500">
                <a href="tel:+31612345678" className="hover:text-gray-900">
                  +31 6 1234 5678
                </a>
              </li>
              <li className="text-sm text-gray-500">
                Netherlands
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-4 border-t border-gray-200 pt-4">
          <p className="text-center text-xs text-gray-400">
            © {new Date().getFullYear()} VliSoft. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
} 