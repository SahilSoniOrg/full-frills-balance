import { WorkplaceContext } from '@/src/contexts/WorkplaceContext';
import { ImportSelectionView } from '@/src/features/settings/components/ImportSelectionView';
import { useImportPlugins } from '@/src/features/settings/hooks/useImportPlugins';
import { useImport } from '@/src/hooks/use-import';
import { useCallback, useContext } from 'react';

export default function ImportSelectionScreen() {
  const workplaceContext = useContext(WorkplaceContext);
  const workplaceId = workplaceContext?.workplaceId;
  const { handleImport, isImporting, progress, progressMessage } = useImport();
  const plugins = useImportPlugins();

  const handleSelect = useCallback(
    (id: string) => {
      handleImport(workplaceId, id);
    },
    [handleImport, workplaceId],
  );

  return (
    <ImportSelectionView
      plugins={plugins}
      isImporting={isImporting}
      progress={progress}
      progressMessage={progressMessage}
      onSelect={handleSelect}
    />
  );
}
