import { AppearancePickerModal } from '@/src/components/common/AppearancePickerModal';
import { IconName } from '@/src/components/core/AppIcon';
import React from 'react';

export interface IconPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (icon: IconName) => void | Promise<void>;
  selectedIcon?: IconName;
  title?: string;
}

export const IconPickerModal: React.FC<IconPickerModalProps> = ({
  visible,
  onClose,
  onSelect,
  selectedIcon,
  title,
}) => {
  return (
    <AppearancePickerModal
      visible={visible}
      mode="icon"
      onClose={onClose}
      onIconSelect={onSelect}
      selectedIcon={selectedIcon}
      title={title}
    />
  );
};
