import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from '../App';

// Mock axios
jest.mock('axios');
const mockedAxios = require('axios');

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-123')
}));

describe('App Component', () => {
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock successful health check
    mockedAxios.get.mockResolvedValue({
      data: {
        status: 'ok',
        timestamp: '2023-10-15T10:30:00.000Z',
        services: {
          cpp_service: { status: 'healthy' },
          redis: { status: 'healthy' }
        }
      }
    });
  });

  test('renders app header and main components', async () => {
    render(<App />);
    
    expect(screen.getByRole('heading', { name: /fault-tolerant full-stack application/i })).toBeInTheDocument();
    expect(screen.getByText(/demonstrating microservices/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /system health/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /process data/i })).toBeInTheDocument();
  });

  test('loads health status on mount', async () => {
    render(<App />);
    
    await waitFor(() => {
      expect(mockedAxios.get).toHaveBeenCalledWith('http://localhost:7071/function/health');
    });
    
    await waitFor(() => {
      expect(screen.getByText('OK')).toBeInTheDocument();
    });
  });

  test('handles form submission successfully', async () => {
    const mockResponse = {
      data: {
        result: 'dlrow olleh',
        processed_at: '2023-10-15T10:30:00.000Z'
      }
    };
    
    mockedAxios.post.mockResolvedValue(mockResponse);
    
    render(<App />);
    
    // Fill the form
    const textarea = screen.getByPlaceholderText(/enter text to be processed/i);
    fireEvent.change(textarea, { target: { value: 'hello world' } });
    
    // Submit the form
    const submitButton = screen.getByRole('button', { name: /process data/i });
    fireEvent.click(submitButton);
    
    // Wait for the API call
    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://localhost:7071/function/process',
        {
          data: 'hello world',
          idempotency_key: 'test-uuid-123'
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000
        }
      );
    });
    
    // Check for success response
    await waitFor(() => {
      expect(screen.getByText(/successfully processed/i)).toBeInTheDocument();
      expect(screen.getByText('"dlrow olleh"')).toBeInTheDocument();
    });
  });

  test('handles form submission error', async () => {
    const mockError = {
      response: {
        status: 503,
        data: {
          error: 'Service temporarily unavailable',
          message: 'Failed after 4 attempts'
        }
      }
    };
    
    mockedAxios.post.mockRejectedValue(mockError);
    
    render(<App />);
    
    // Fill and submit the form
    const textarea = screen.getByPlaceholderText(/enter text to be processed/i);
    fireEvent.change(textarea, { target: { value: 'test data' } });
    
    const submitButton = screen.getByRole('button', { name: /process data/i });
    fireEvent.click(submitButton);
    
    // Wait for error response
    await waitFor(() => {
      expect(screen.getByText(/service temporarily unavailable/i)).toBeInTheDocument();
    });
  });

  test('disables form during loading', async () => {
    // Mock a delayed response
    mockedAxios.post.mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve({ data: {} }), 1000))
    );
    
    render(<App />);
    
    const textarea = screen.getByPlaceholderText(/enter text to be processed/i);
    const submitButton = screen.getByRole('button', { name: /process data/i });
    
    fireEvent.change(textarea, { target: { value: 'test' } });
    fireEvent.click(submitButton);
    
    // Check loading state
    expect(screen.getByText(/processing.../i)).toBeInTheDocument();
    expect(submitButton).toBeDisabled();
    expect(textarea).toBeDisabled();
  });
});