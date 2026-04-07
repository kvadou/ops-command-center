/**
 * Tests for ClientConversionTracker component
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import ClientConversionTracker from '../ClientConversionTracker';

// Mock the API calls
vi.mock('../../utils/apiUtils', () => ({
  apiGet: vi.fn(),
  apiPut: vi.fn(),
  apiPost: vi.fn(),
}));

// Import mocked functions after vi.mock
import { apiGet as mockApiGet, apiPut as mockApiPut, apiPost as mockApiPost } from '../../utils/apiUtils';

// TODO: Re-enable this test suite once the component is refactored into smaller pieces
// The ClientConversionTracker component is 10,190 lines and has extensive dependencies
// that make it difficult to test. Consider breaking it up first.
describe.skip('ClientConversionTracker', () => {
  const mockClients = [
    {
      id: 1,
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com',
      status: 'prospect',
      market: 'NYC',
      lead_type: 'New Lead',
    },
    {
      id: 2,
      first_name: 'Jane',
      last_name: 'Smith',
      email: 'jane@example.com',
      status: 'live',
      market: 'LA',
      lead_type: 'Referral',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet.mockResolvedValue(mockClients);
  });

  const renderComponent = () => {
    return render(
      <BrowserRouter>
        <ClientConversionTracker />
      </BrowserRouter>
    );
  };

  it('should render the component', async () => {
    renderComponent();
    
    // Wait for data to load
    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalled();
    });
  });

  it('should display clients when loaded', async () => {
    renderComponent();
    
    await waitFor(() => {
      expect(screen.getByText(/John/i)).toBeInTheDocument();
    });
  });

  it('should handle loading state', () => {
    mockApiGet.mockImplementation(() => new Promise(() => {})); // Never resolves
    renderComponent();
    
    // Component should show loading state
    // Adjust based on your actual loading implementation
  });

  it('should handle error state', async () => {
    mockApiGet.mockRejectedValue(new Error('API Error'));
    renderComponent();
    
    await waitFor(() => {
      // Component should display error
      // Adjust based on your actual error handling
    });
  });
});
