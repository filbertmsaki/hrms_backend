import { BadRequestException } from '@nestjs/common';
import { renderEmploymentLetterBody } from './employment-letters.service';

describe('renderEmploymentLetterBody', () => {
  it('renders supported values and permits templates without placeholders', () => {
    expect(
      renderEmploymentLetterBody('Hello {{ employee_name }}', {
        employee_name: 'Ada Employee',
      }),
    ).toBe('Hello Ada Employee');
    expect(renderEmploymentLetterBody('Please report on Monday.', {})).toBe(
      'Please report on Monday.',
    );
  });

  it('rejects unknown placeholders', () => {
    expect(() => renderEmploymentLetterBody('Hi {{password}}', {})).toThrow(
      BadRequestException,
    );
  });

  it('rejects known placeholders whose source value is unavailable', () => {
    expect(() =>
      renderEmploymentLetterBody('Salary {{salary}}', { salary: '' }),
    ).toThrow('Template value salary is not available for this record');
  });
});
