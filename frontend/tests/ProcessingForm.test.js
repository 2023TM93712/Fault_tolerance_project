import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProcessingForm from '../components/ProcessingForm';

describe('ProcessingForm Component', () => {
  const mockOnSubmit = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders form elements correctly', () => {
    render(<ProcessingForm onSubmit={mockOnSubmit} loading={false} />);
    
    expect(screen.getByLabelText(/data to process/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/use idempotency key/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /process data/i })).toBeInTheDocument();
  });

  test('calls onSubmit with correct data when form is submitted', () => {
    render(<ProcessingForm onSubmit={mockOnSubmit} loading={false} />);
    
    const textarea = screen.getByLabelText(/data to process/i);
    const checkbox = screen.getByLabelText(/use idempotency key/i);
    const submitButton = screen.getByRole('button', { name: /process data/i });
    
    fireEvent.change(textarea, { target: { value: 'test data' } });
    fireEvent.click(submitButton);
    
    expect(mockOnSubmit).toHaveBeenCalledWith('test data', true);
  });

  test('submits without idempotency key when checkbox is unchecked', () => {
    render(<ProcessingForm onSubmit={mockOnSubmit} loading={false} />);
    
    const textarea = screen.getByLabelText(/data to process/i);
    const checkbox = screen.getByLabelText(/use idempotency key/i);
    const submitButton = screen.getByRole('button', { name: /process data/i });
    
    fireEvent.change(textarea, { target: { value: 'test data' } });
    fireEvent.click(checkbox); // Uncheck
    fireEvent.click(submitButton);
    
    expect(mockOnSubmit).toHaveBeenCalledWith('test data', false);
  });

  test('disables form elements when loading', () => {
    render(<ProcessingForm onSubmit={mockOnSubmit} loading={true} />);
    
    const textarea = screen.getByLabelText(/data to process/i);
    const checkbox = screen.getByLabelText(/use idempotency key/i);
    const submitButton = screen.getByRole('button', { name: /processing.../i });
    
    expect(textarea).toBeDisabled();
    expect(checkbox).toBeDisabled();
    expect(submitButton).toBeDisabled();
  });

  test('does not submit empty form', () => {
    render(<ProcessingForm onSubmit={mockOnSubmit} loading={false} />);
    
    const submitButton = screen.getByRole('button', { name: /process data/i });
    
    expect(submitButton).toBeDisabled();
    
    fireEvent.click(submitButton);
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  test('trims whitespace from input', () => {
    render(<ProcessingForm onSubmit={mockOnSubmit} loading={false} />);
    
    const textarea = screen.getByLabelText(/data to process/i);
    const submitButton = screen.getByRole('button', { name: /process data/i });
    
    fireEvent.change(textarea, { target: { value: '  test data  ' } });
    fireEvent.click(submitButton);
    
    expect(mockOnSubmit).toHaveBeenCalledWith('test data', true);
  });
});