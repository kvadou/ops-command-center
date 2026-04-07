import React, { useState, useEffect } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';

export default function PackageModal({ 
  open, 
  onClose, 
  onSave, 
  package: pkg = null 
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    cost: '',
    bonus_credit: '',
    icon: '',
    icon_colour: '#000000',
    sort_index: 0,
    active: true
  });

  useEffect(() => {
    if (open) {
      if (pkg) {
        setFormData({
          name: pkg.name || '',
          description: pkg.description || '',
          cost: pkg.cost || '',
          bonus_credit: pkg.bonusCredit || '',
          icon: pkg.icon || '',
          icon_colour: pkg.iconColour || '#000000',
          sort_index: pkg.sortIndex || 0,
          active: pkg.active !== undefined ? pkg.active : true
        });
      } else {
        setFormData({
          name: '',
          description: '',
          cost: '',
          bonus_credit: '',
          icon: '',
          icon_colour: '#000000',
          sort_index: 0,
          active: true
        });
      }
      setError(null);
    }
  }, [open, pkg]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const url = pkg 
        ? `/api/packages/${pkg.id}`
        : '/api/packages';
      
      const method = pkg ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          cost: parseFloat(formData.cost) || 0,
          bonus_credit: parseFloat(formData.bonus_credit) || 0,
          icon: formData.icon,
          icon_colour: formData.icon_colour,
          sort_index: parseInt(formData.sort_index) || 0,
          active: formData.active
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.details || 'Failed to save package');
      }

      onSave();
    } catch (err) {
      console.error('Error saving package:', err);
      setError(err.message || 'Failed to save package. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="mx-auto max-w-2xl w-full bg-white rounded-xl shadow-xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between p-6 border-b border-neutral-200 sticky top-0 bg-white z-10">
            <DialogTitle className="text-lg font-semibold text-neutral-900">
              {pkg ? 'Edit Package' : 'Add Package'}
            </DialogTitle>
            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-neutral-500"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {/* Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-neutral-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="name"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-transparent"
                placeholder="Enter package name"
              />
              <p className="mt-1 text-xs text-neutral-500">
                This is the name of the package that will be displayed to clients.
              </p>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-neutral-700 mb-1">
                Description
              </label>
              <textarea
                id="description"
                rows={6}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-transparent"
                placeholder="Enter package description"
              />
              <p className="mt-1 text-xs text-neutral-500">
                The description will be shown to clients when they are browsing packages. You can use markdown to format the description.
              </p>
            </div>

            {/* Cost */}
            <div>
              <label htmlFor="cost" className="block text-sm font-medium text-neutral-700 mb-1">
                Cost <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                id="cost"
                required
                step="0.01"
                min="0"
                value={formData.cost}
                onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-transparent"
                placeholder="0.00"
              />
              <p className="mt-1 text-xs text-neutral-500">
                This is the total amount the client will pay, inclusive of all taxes.
              </p>
            </div>

            {/* Bonus Credit */}
            <div>
              <label htmlFor="bonus_credit" className="block text-sm font-medium text-neutral-700 mb-1">
                Bonus credit <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                id="bonus_credit"
                required
                step="0.01"
                min="0"
                value={formData.bonus_credit}
                onChange={(e) => setFormData({ ...formData, bonus_credit: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-transparent"
                placeholder="0.00"
              />
              <p className="mt-1 text-xs text-neutral-500">
                This is the additional credit that will be added to the client's account when they purchase this package. Set this to 0 if you do not want to include bonus credit.
              </p>
            </div>

            {/* Icon */}
            <div>
              <label htmlFor="icon" className="block text-sm font-medium text-neutral-700 mb-1">
                Icon
              </label>
              <input
                type="text"
                id="icon"
                value={formData.icon}
                onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-transparent"
                placeholder="Enter icon name"
              />
              <p className="mt-1 text-xs text-neutral-500">
                Choose an icon for this package from a list of icons. To set an icon, use the icon name found beneath each icon.
              </p>
            </div>

            {/* Icon Colour */}
            <div>
              <label htmlFor="icon_colour" className="block text-sm font-medium text-neutral-700 mb-1">
                Icon colour <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  id="icon_colour"
                  required
                  value={formData.icon_colour}
                  onChange={(e) => setFormData({ ...formData, icon_colour: e.target.value })}
                  className="h-10 w-20 border border-neutral-300 rounded-lg cursor-pointer"
                />
                <input
                  type="text"
                  value={formData.icon_colour}
                  onChange={(e) => setFormData({ ...formData, icon_colour: e.target.value })}
                  className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-transparent"
                  placeholder="#000000"
                />
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                Select the colour for your icon.
              </p>
            </div>

            {/* Sort Index */}
            <div>
              <label htmlFor="sort_index" className="block text-sm font-medium text-neutral-700 mb-1">
                Sort index <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                id="sort_index"
                required
                min="0"
                value={formData.sort_index}
                onChange={(e) => setFormData({ ...formData, sort_index: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-transparent"
                placeholder="0"
              />
              <p className="mt-1 text-xs text-neutral-500">
                Set the order in which packages are shown to clients. Higher values will place the package higher in the list.
              </p>
            </div>

            {/* Active */}
            <div className="flex items-start">
              <div className="flex items-center h-5">
                <input
                  id="active"
                  type="checkbox"
                  checked={formData.active}
                  onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                  className="h-4 w-4 text-brand-purple focus:ring-brand-purple border-neutral-300 rounded"
                />
              </div>
              <div className="ml-3 text-sm">
                <label htmlFor="active" className="font-medium text-neutral-700">
                  Active
                </label>
                <p className="text-neutral-500">
                  Whether the package is available for purchase or not. Only active packages will be displayed to clients.
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-white bg-brand-purple rounded-lg hover:bg-brand-navy transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={loading}
              >
                {loading ? 'Saving...' : (pkg ? 'Update' : 'Create')}
              </button>
            </div>
          </form>
        </DialogPanel>
      </div>
    </Dialog>
  );
}

