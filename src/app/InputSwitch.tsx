// Camera / keyboard switch for the select screen's settings row, so body control is findable
// without knowing about K. Choosing "Camera" starts it at once, so Chrome asks for permission here
// and not in the middle of a round.
import { Camera, Keyboard } from 'lucide-react';
import { SegmentedControl } from '@/ui/kit';

export type InputKind = 'pose' | 'keyboard';

const OPTIONS = [
  { value: 'pose', label: 'Camera', icon: Camera },
  { value: 'keyboard', label: 'Keyboard', icon: Keyboard },
] as const;

export function InputSwitch({
  value,
  onChange,
}: {
  value: InputKind;
  onChange: (kind: InputKind) => void;
}) {
  return (
    <SegmentedControl<InputKind>
      aria-label="Control"
      value={value}
      onChange={onChange}
      options={OPTIONS}
      size="md"
    />
  );
}
