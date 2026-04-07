import { Fragment, useContext } from 'react';
import { Menu, MenuButton, MenuItem, MenuItems, Transition } from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { RoleContext } from '../contexts/RoleContext';

export default function RoleSelector() {
  // Check if context exists without throwing
  const roleContext = useContext(RoleContext);
  
  // If no context provider, return null
  if (!roleContext) {
    return null;
  }

  const { currentRole, switchRole, getAvailableRoles, getRoleInfo, roleInfo } = roleContext;
  const availableRoles = getAvailableRoles();
  const canSwitchRoles = availableRoles.length > 1;

  const CurrentIcon = roleInfo?.icon;

  return (
    <Menu as="div" className="relative inline-block text-left w-full">
      <div>
        <MenuButton 
          disabled={!canSwitchRoles}
          className={`inline-flex w-full items-center justify-between gap-2 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-purple focus:ring-offset-2 ${
            canSwitchRoles ? 'hover:bg-neutral-50 cursor-pointer' : 'cursor-default opacity-75'
          }`}
        >
          <div className="flex items-center gap-2">
            {CurrentIcon && <CurrentIcon className="h-4 w-4 sm:h-5 sm:w-5 text-brand-purple" />}
            <span>{roleInfo?.label}</span>
          </div>
          {canSwitchRoles && (
            <ChevronDownIcon className="h-4 w-4 text-brand-purple flex-shrink-0" aria-hidden="true" />
          )}
        </MenuButton>
      </div>

      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <MenuItems className="absolute right-0 z-10 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
          <div className="py-1">
            {canSwitchRoles && availableRoles.map((roleId) => {
              const role = getRoleInfo(roleId);
              const isActive = currentRole === roleId;
              return (
                <MenuItem key={roleId}>
                  {({ focus }) => (
                    <button
                      onClick={() => switchRole(roleId)}
                      className={`
                        ${focus ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-700'}
                        ${isActive ? 'bg-brand-light text-brand-navy font-medium' : ''}
                        flex w-full items-center gap-3 px-4 py-2 text-sm
                      `}
                    >
                      {role?.icon && (
                        <role.icon className="h-4 w-4 sm:h-5 sm:w-5 text-brand-purple flex-shrink-0" />
                      )}
                      <div className="flex-1 text-left">
                        <div className="font-medium">{role?.label}</div>
                        {role?.description && (
                          <div className="text-xs text-neutral-500">{role?.description}</div>
                        )}
                      </div>
                      {isActive && (
                        <span className="text-brand-purple">✓</span>
                      )}
                    </button>
                  )}
                </MenuItem>
              );
            })}
            {!canSwitchRoles && (
              <div className="px-4 py-2 text-sm text-neutral-500">
                No other roles available
              </div>
            )}
          </div>
        </MenuItems>
      </Transition>
    </Menu>
  );
}

