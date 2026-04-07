import React, { useMemo } from 'react';
import { PlusIcon } from '@heroicons/react/24/outline';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getLabelColor, getContrastColor } from '../../../utils/labelColors';
import { useClientConversionData } from '../../../hooks/useClientConversionData';
import { useClientConversionUI } from '../../../hooks/useClientConversionUI';

/**
 * PipelineView - Kanban board for managing client pipeline stages
 *
 * Displays clients in a drag-and-drop Kanban board organized by pipeline stage.
 * Clients can be dragged between stages to update their pipeline status.
 */
export default function PipelineView({
  resetManualIntakeForm,
  setShowManualIntakeModal,
  handlePipelineStageUpdate,
  getStageColor,
  getTimeInStage,
  getLabelTextColor,
  sensors,
  filteredClients,
  pipelineStages = [],
}) {
  // Get UI state from hooks
  const { activeId, setActiveId } = useClientConversionUI();

  // Drag handlers
  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) {
      return;
    }

    const activeIdStr = String(active?.id ?? '');
    if (!activeIdStr) {
      return;
    }

    // Extract client ID from composite key (format: "stageId-clientId-index")
    const parts = activeIdStr.split('-');
    const clientId =
      parts.length > 2
        ? parts.slice(1, -1).join('-')
        : parts.length === 2
          ? parts[1]
          : activeIdStr;

    // Determine the target stage container
    const overContainerId =
      over.data?.current?.sortable?.containerId ??
      over.data?.current?.containerId ??
      over.id;

    if (!overContainerId) {
      return;
    }

    const activeContainerId =
      active.data?.current?.sortable?.containerId ??
      active.data?.current?.containerId;

    // No pipeline change if we dropped back into the same stage
    if (activeContainerId && activeContainerId === overContainerId) {
      return;
    }

    const newStageId = Number(overContainerId);
    if (Number.isNaN(newStageId)) {
      console.warn('Skipping pipeline stage update; invalid stage identifier', overContainerId);
      return;
    }

    handlePipelineStageUpdate(clientId, newStageId);
  };

  // Group clients by pipeline stage for pipeline view
  const clientsByStage = useMemo(() => {
    const grouped = pipelineStages.reduce((acc, stage) => {
      // Filter clients for this stage and deduplicate by client ID
      // Use loose comparison to handle string/number type mismatches
      const stageClients = filteredClients.filter(client => {
        const clientStageId = client.pipeline_stage_id;
        const stageId = stage.id;
        // Handle both string and number comparisons
        return clientStageId != null && stageId != null &&
               (clientStageId === stageId ||
                String(clientStageId) === String(stageId) ||
                Number(clientStageId) === Number(stageId));
      });
      // Deduplicate: keep only the first occurrence of each client ID
      const uniqueClients = stageClients.filter((client, index, self) =>
        index === self.findIndex(c => c.id === client.id)
      );
      acc[stage.id] = uniqueClients;
      return acc;
    }, {});

    // Find clients without a pipeline_stage_id and assign them to the first stage
    // (or "New Lead" stage if it exists)
    const unassignedClients = filteredClients.filter(client => {
      const clientStageId = client.pipeline_stage_id;
      return clientStageId == null || clientStageId === '' || clientStageId === undefined;
    });

    if (unassignedClients.length > 0 && pipelineStages.length > 0) {
      // Try to find "New Lead" stage first, otherwise use the first stage
      const defaultStage = pipelineStages.find(s => s.name === 'New Lead') || pipelineStages[0];
      if (defaultStage) {
        // Deduplicate unassigned clients
        const uniqueUnassigned = unassignedClients.filter((client, index, self) =>
          index === self.findIndex(c => c.id === client.id)
        );
        // Add to default stage, avoiding duplicates
        const existingInStage = grouped[defaultStage.id] || [];
        const existingIds = new Set(existingInStage.map(c => c.id));
        const newUnassigned = uniqueUnassigned.filter(c => !existingIds.has(c.id));
        grouped[defaultStage.id] = [...existingInStage, ...newUnassigned];
      }
    }

    return grouped;
  }, [pipelineStages, filteredClients]);

  // Sortable Client Card Component
  const SortableClientCard = ({ client, stage, index }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: `${stage.id}-${client.id}-${index}` });

    // Enhanced transition with smooth easing
    const smoothTransition = transition || 'transform 200ms cubic-bezier(0.2, 0, 0.2, 1), opacity 200ms cubic-bezier(0.2, 0, 0.2, 1)';

    // Combine transform with scale for smooth animation
    const transformString = transform
      ? `${CSS.Transform.toString(transform)} ${isDragging ? 'scale(0.95)' : 'scale(1)'}`
      : isDragging ? 'scale(0.95)' : 'scale(1)';

    const style = {
      transform: transformString,
      transition: smoothTransition,
      opacity: isDragging ? 0.4 : 1,
    };

    return (
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className="bg-white p-3 rounded border hover:shadow-sm transition-all duration-200 ease-out cursor-grab active:cursor-grabbing"
      >
        <div className="text-sm font-medium text-neutral-900">
          {typeof client.first_name === 'string' ? client.first_name : ''} {typeof client.last_name === 'string' ? client.last_name : ''}
        </div>
        <div className="text-xs text-neutral-500">
          {getTimeInStage(client.date_entered_current_stage || client.date_entered_pipeline || client.date_registration_complete || client.client_created_at)} in {stage.name}
        </div>
        {client.labels && Array.isArray(client.labels) && client.labels.length > 0 && (
          <div className="mt-2 space-y-1">
            {client.labels.map((label, index) => {
              const labelName = typeof label === 'string' ? label : (label && label.name ? label.name : JSON.stringify(label));
              const backgroundColor = getLabelColor(labelName);
              const textColor = getLabelTextColor(backgroundColor);
              return (
                <span
                  key={index}
                  className="inline-block text-xs px-2 py-1 rounded mr-1 mb-1"
                  style={{ backgroundColor, color: textColor }}
                >
                  {labelName}
                </span>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // Droppable Stage Component
  const DroppableStage = ({ stage, clients }) => {
    const { isOver, setNodeRef } = useDroppable({
      id: stage.id.toString(),
    });

    return (
      <div
        ref={setNodeRef}
        className={`bg-neutral-50 rounded-lg p-4 min-h-[400px] transition-all duration-200 ease-out ${
          isOver ? 'bg-[#E8FBFF] ring-2 ring-blue-300 ring-opacity-50 shadow-sm' : ''
        }`}
      >
        <div
          className="text-white px-3 py-2 rounded-t-lg mb-3"
          style={{ backgroundColor: getStageColor(stage.name) }}
        >
          <div className="flex items-center justify-between">
            <h4 className="font-medium">{stage.name}</h4>
            <span className="bg-white bg-opacity-20 text-white text-xs px-2 py-1 rounded-full">
              {clients.length}
            </span>
          </div>
        </div>
        <SortableContext
          id={stage.id.toString()}
          items={clients.map((client, idx) => `${stage.id}-${client.id}-${idx}`)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2 transition-all duration-200">
            {clients.map((client, index) => (
              <SortableClientCard
                key={`${stage.id}-${client.id}-${index}`}
                client={client}
                stage={stage}
                index={index}
              />
            ))}
          </div>
        </SortableContext>
      </div>
    );
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="bg-white shadow rounded-lg p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-medium text-neutral-900">Sales Pipeline</h3>
            <p className="text-sm text-neutral-600">Drag clients between stages to track their progress</p>
          </div>
          <button
            type="button"
            onClick={() => {
              resetManualIntakeForm();
              setShowManualIntakeModal(true);
            }}
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition"
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            Add Prospect
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-6 gap-4">
          {pipelineStages.map((stage) => (
            <DroppableStage
              key={stage.id}
              stage={stage}
              clients={clientsByStage[stage.id] || []}
            />
          ))}
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {activeId ? (
          <div className="bg-white p-3 rounded border shadow-2xl opacity-95 transform rotate-2 scale-105 transition-all duration-150">
            <div className="text-sm font-medium text-neutral-900">
              {(() => {
                // Extract client ID from composite key (format: "stageId-clientId-index")
                const activeIdStr = String(activeId);
                const parts = activeIdStr.split('-');
                // Extract client ID: everything between the first and last part (which is the index)
                const clientId = parts.length > 2 ? parts.slice(1, -1).join('-') : (parts.length === 2 ? parts[1] : activeIdStr);
                const client = filteredClients.find(c => c.id === clientId || c.id?.toString() === clientId);
                return client ? `${typeof client.first_name === 'string' ? client.first_name : ''} ${typeof client.last_name === 'string' ? client.last_name : ''}`.trim() : '';
              })()}
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
