import React from 'react';
import { Link } from 'react-router-dom';

/**
 * List Item component for Students, Tutors, etc. following Acme Operations brand system
 * 
 * @param {string} title
 * @param {string} subtitle
 * @param {string} href - Optional link
 * @param {React.ReactNode} action - Optional action button/icon
 * @param {React.ReactNode} children
 * @param {string} className
 * @param {object} props - Other div props
 */
export default function ListItem({
  title,
  subtitle,
  href,
  action,
  children,
  className = '',
  ...props
}) {
  const content = (
    <>
      <div className="flex-1">
        {title && (
          <div className="font-medium text-primary-700">
            {href ? (
              <Link to={href} className="hover:text-primary-600 transition-colors">
                {title}
              </Link>
            ) : (
              title
            )}
          </div>
        )}
        {subtitle && (
          <div className="text-sm text-neutral-600 mt-1">{subtitle}</div>
        )}
        {children}
      </div>
      {action && <div className="ml-4">{action}</div>}
    </>
  );
  
  return (
    <div
      className={`bg-white rounded-lg p-4 shadow-sm border-l-4 border-primary-500 flex items-center ${className}`}
      {...props}
    >
      {content}
    </div>
  );
}
