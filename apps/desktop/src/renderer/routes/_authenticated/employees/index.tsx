import { createFileRoute } from '@tanstack/react-router';
import { EmployeeActivityScreen } from './-activity-screen';

export const Route = createFileRoute('/_authenticated/employees/')({
  component: EmployeeActivityScreen,
});
