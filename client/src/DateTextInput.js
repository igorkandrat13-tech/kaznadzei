import React, { useEffect, useState } from 'react';
import { formatDateInputValue, maskDateInputValue, parseDateInputValue } from './dateTime';

function DateTextInput({
  value,
  onChange,
  onFocus,
  onBlur,
  placeholder = 'дд.мм.гггг',
  inputMode = 'numeric',
  ...props
}) {
  const [displayValue, setDisplayValue] = useState(() => formatDateInputValue(value));

  useEffect(() => {
    setDisplayValue(formatDateInputValue(value));
  }, [value]);

  const handleChange = (event) => {
    const nextDisplayValue = maskDateInputValue(event.target.value);
    setDisplayValue(nextDisplayValue);
    if (!onChange) return;
    if (!nextDisplayValue) {
      onChange('');
      return;
    }
    const nextIsoValue = parseDateInputValue(nextDisplayValue);
    if (nextIsoValue) {
      onChange(nextIsoValue);
    }
  };

  const handleBlur = (event) => {
    const nextIsoValue = parseDateInputValue(displayValue);
    if (!displayValue) {
      setDisplayValue('');
    } else if (nextIsoValue) {
      setDisplayValue(formatDateInputValue(nextIsoValue));
    } else {
      setDisplayValue(formatDateInputValue(value));
    }
    onBlur?.(event);
  };

  return (
    <input
      {...props}
      type="text"
      inputMode={inputMode}
      placeholder={placeholder}
      value={displayValue}
      onChange={handleChange}
      onFocus={onFocus}
      onBlur={handleBlur}
    />
  );
}

export default DateTextInput;
