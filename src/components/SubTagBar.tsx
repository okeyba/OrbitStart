import type { MouseEvent } from "react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties } from "react";

export type SubTagOption = {
  name: string;
  count: number;
};

interface SubTagBarProps {
  groupId: string;
  options: SubTagOption[];
  activeSubTag: string;
  totalCount: number;
  onChange: (subTag: string) => void;
  onCreate: () => void;
  onContextMenu?: (event: MouseEvent<HTMLButtonElement>, subTag: string) => void;
  onReorder: (newNames: string[]) => void;
}

interface SortableSubTagPillProps {
  option: SubTagOption;
  groupId: string;
  activeSubTag: string;
  onClick: () => void;
  onContextMenu?: (event: MouseEvent<HTMLButtonElement>) => void;
}

function SortableSubTagPill({ option, groupId, activeSubTag, onClick, onContextMenu }: SortableSubTagPillProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: option.name,
  });

  const style: CSSProperties = {
    transform: transform ? CSS.Transform.toString(transform) : undefined,
    transition,
    opacity: isDragging ? 0.6 : 1,
    position: "relative",
    display: "inline-flex",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`subtag-pill-wrapper ${isDragging ? "dragging" : ""}`}
    >
      <button
        type="button"
        data-subtag-name={option.name}
        data-subtag-group-id={groupId}
        className={`subtag-pill ${activeSubTag === option.name ? "selected" : ""}`}
        onClick={onClick}
        onContextMenu={onContextMenu}
      >
        <span>{option.name.split("/").filter(Boolean).join(" / ")}</span>
        <em>{option.count}</em>
      </button>
    </div>
  );
}

export function SubTagBar({
  groupId,
  options,
  activeSubTag,
  totalCount,
  onChange,
  onCreate,
  onContextMenu,
  onReorder,
}: SubTagBarProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4,
      },
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = options.findIndex((opt) => opt.name === active.id);
    const newIndex = options.findIndex((opt) => opt.name === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      const reordered = arrayMove(options, oldIndex, newIndex);
      onReorder(reordered.map((opt) => opt.name));
    }
  };

  const restrictToHorizontalAxis = ({ transform }: any) => ({
    ...transform,
    y: 0,
  });

  return (
    <section className="subtag-section" aria-label="当前子标签">
      <div className="section-head slim">
        <h2>当前子标签</h2>
      </div>
      <div className="subtag-row" role="tablist" aria-label="子标签筛选">
        {options.length > 0 && (
          <button
            type="button"
            className={`subtag-pill ${activeSubTag === "ALL" ? "selected" : ""}`}
            onClick={() => onChange("ALL")}
            role="tab"
            aria-selected={activeSubTag === "ALL"}
          >
            <span>全部</span>
            <em>{totalCount}</em>
          </button>
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          modifiers={[restrictToHorizontalAxis]}
        >
          <SortableContext items={options.map((opt) => opt.name)} strategy={horizontalListSortingStrategy}>
            {options.map((option) => (
              <SortableSubTagPill
                key={option.name}
                option={option}
                groupId={groupId}
                activeSubTag={activeSubTag}
                onClick={() => onChange(option.name)}
                onContextMenu={(event) => onContextMenu?.(event, option.name)}
              />
            ))}
          </SortableContext>
        </DndContext>

        <button type="button" className="subtag-pill subtag-create" onClick={onCreate}>
          <span>新建子标签</span>
        </button>
      </div>
    </section>
  );
}
