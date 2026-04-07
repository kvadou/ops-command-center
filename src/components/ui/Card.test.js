import { describe, it, expect } from 'vitest';
import { render, screen } from '@/tests/test-utils';
import Card from './Card';

describe('Card', () => {
  it('renders with children', () => {
    render(<Card>Card content</Card>);
    expect(screen.getByText('Card content')).toBeInTheDocument();
  });

  it('applies default styles', () => {
    render(<Card data-testid="card">Card content</Card>);
    const card = screen.getByTestId('card');
    expect(card).toHaveClass('bg-white', 'rounded-xl', 'shadow-sm', 'border', 'border-neutral-200');
  });

  it('accepts custom className', () => {
    render(<Card className="custom-class" data-testid="card">Card content</Card>);
    const card = screen.getByTestId('card');
    expect(card).toHaveClass('custom-class');
  });

  it('forwards other props to div element', () => {
    render(<Card data-testid="custom-card" aria-label="Custom Card">Card content</Card>);
    const card = screen.getByTestId('custom-card');
    expect(card).toHaveAttribute('aria-label', 'Custom Card');
  });

  it('renders multiple children', () => {
    render(
      <Card>
        <h2>Title</h2>
        <p>Description</p>
      </Card>
    );
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
  });
});
