import { render, screen } from '@testing-library/react';
import { ColumnChart } from './ColumnChart';

const series = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `d${i}`, value: i % 5, tooltip: `day ${i}` }));

test('short series keep the 2px gap between columns', () => {
  render(<ColumnChart title="Short" data={series(30)} />);
  expect(screen.getByTestId('columns').className).toContain('gap-[2px]');
});

test('long series drop the fixed gap so a year still fits the card', () => {
  render(<ColumnChart title="Year" data={series(366)} />);
  expect(screen.getByTestId('columns').className).not.toContain('gap-[2px]');
});
