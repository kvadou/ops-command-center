/**
 * Acme Operations - Unified UI Component Library
 *
 * This index file exports all UI components from the design system.
 * Import components from './components/ui' for consistent usage.
 *
 * Usage:
 * import { Button, Card, Input, Badge } from './components/ui';
 */

// Buttons
export { default as Button, IconButton, ButtonGroup } from './Button';

// Cards
export {
  default as Card,
  CardHeader,
  CardBody,
  CardFooter,
  CardDivider,
  CardGrid,
  StatsCard,
} from './Card';

// Badges
export {
  default as Badge,
  StatusBadge,
  CountBadge,
  BadgeGroup,
} from './Badge';

// Form Inputs
export { default as Input, SearchInput, PasswordInput } from './Input';
export { default as Select, SelectNative } from './Select';
export { default as Textarea } from './Textarea';

// Tables
export {
  default as Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableFooter,
  TableCaption,
  DataTable,
} from './Table';

// Navigation
export { default as TabNav } from './TabNav';

// List & Layout
export { default as ListItem } from './ListItem';
export { default as EmptyState } from './EmptyState';

// Modals
export { default as Modal } from './Modal';
export { default as EmailPreviewModal } from './EmailPreviewModal';
