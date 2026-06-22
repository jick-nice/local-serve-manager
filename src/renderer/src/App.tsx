import { useEffect, useMemo, useState } from "react";
import { Copy, FileText, FolderPlus, Pencil, Play, Plus, Save, Square, Terminal, Trash2, X } from "lucide-react";
import { STACK_LABELS } from "@shared/serviceDefaults";
import type {
  CommandKind,
  CommandLogEntry,
  CommandStatus,
  LogEntry,
  ProjectWithServices,
  Service,
  ServiceCommand,
  ServiceCommandDraft,
  ServiceDraft,
  ServiceStack,
  ServiceStatus
} from "@shared/types";

type StatusFilter = ServiceStatus | "all";

interface EditorState {
  title: string;
  draft: ServiceDraft;
  projectId: number | null;
  service?: Service;
}

interface ImportState {
  rootPath: string;
  projectName: string;
  drafts: ServiceDraft[];
}

const stackOptions = Object.keys(STACK_LABELS) as ServiceStack[];
const COMMAND_STATUS_LABELS: Record<CommandStatus, string> = {
  idle: "空闲",
  running: "运行中",
  finished: "已完成",
  failed: "失败",
  stopping: "停止中"
};

const folderName = (path: string): string => path.split(/[\\/]/).filter(Boolean).at(-1) ?? "新项目";

export default function App(): JSX.Element {
  if (!window.serveManager) {
    return <DesktopOnly />;
  }

  const [projects, setProjects] = useState<ProjectWithServices[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [importState, setImportState] = useState<ImportState | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [activeLogService, setActiveLogService] = useState<Service | null>(null);
  const [activeCommandService, setActiveCommandService] = useState<Service | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const reload = async (): Promise<void> => {
    const snapshot = await window.serveManager.getSnapshot();
    setProjects(snapshot.projects);
    if (activeLogService) {
      const latest = snapshot.projects.flatMap((project) => project.services).find((service) => service.id === activeLogService.id);
      if (latest) setActiveLogService(latest);
    }
  };

  useEffect(() => {
    void reload();
    const offService = window.serveManager.onServiceChanged((changed) => {
      setProjects((current) =>
        current.map((project) => ({
          ...project,
          services: project.services.map((service) => (service.id === changed.id ? changed : service))
        }))
      );
      setActiveLogService((current) => (current?.id === changed.id ? changed : current));
    });
    const offLog = window.serveManager.onLog((entry) => {
      setLogs((current) => (activeLogService?.id === entry.serviceId ? [...current, entry] : current));
    });
    return () => {
      offService();
      offLog();
    };
  }, [activeLogService?.id]);

  useEffect(() => {
    if (!activeLogService) return;
    void window.serveManager.getLogs(activeLogService.id).then(setLogs);
  }, [activeLogService?.id]);

  const filteredProjects = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    return projects
      .map((project) => ({
        ...project,
        services: project.services.filter((service) => {
          const matchesText =
            !lowered ||
            service.name.toLowerCase().includes(lowered) ||
            service.servicePath.toLowerCase().includes(lowered) ||
            service.note.toLowerCase().includes(lowered) ||
            service.command.toLowerCase().includes(lowered);
          const matchesStatus = statusFilter === "all" || service.lastStatus === statusFilter;
          return matchesText && matchesStatus;
        })
      }))
      .filter((project) => project.services.length > 0 || (!lowered && statusFilter === "all"));
  }, [projects, query, statusFilter]);

  const addProject = async (): Promise<void> => {
    const chosen = await window.serveManager.chooseDirectory();
    if (chosen.canceled || !chosen.path) return;
    const drafts = await window.serveManager.scanProject(chosen.path);
    setImportState({ rootPath: chosen.path, projectName: folderName(chosen.path), drafts });
  };

  const addService = async (): Promise<void> => {
    const chosen = await window.serveManager.chooseDirectory();
    if (chosen.canceled || !chosen.path) return;
    const draft = await window.serveManager.detectService(chosen.path);
    if (projects.length === 0) {
      await window.serveManager.saveProject({ name: folderName(chosen.path), rootPath: chosen.path, services: [draft] });
      await reload();
      return;
    }
    setEditor({ title: "手动添加服务", draft, projectId: projects[0].id });
  };

  const saveEditor = async (): Promise<void> => {
    if (!editor || !editor.projectId) return;
    if (editor.service) {
      await window.serveManager.updateService({ ...editor.service, ...editor.draft, projectId: editor.projectId });
    } else {
      await window.serveManager.saveService({ ...editor.draft, projectId: editor.projectId });
    }
    setEditor(null);
    await reload();
  };

  const startService = async (service: Service): Promise<void> => {
    const dependency = await window.serveManager.checkDependencies(service.id);
    if (dependency.missing && dependency.installCommand) {
      const install = window.confirm(`${dependency.message}\n\n是否执行：${dependency.installCommand}`);
      if (install) await window.serveManager.installDependencies(service.id);
    }

    const conflict = await window.serveManager.startService(service.id);
    if (conflict?.available === false && conflict.suggestedPort) {
      const replace = window.confirm(`端口 ${conflict.requestedPort} 被占用，是否改用 ${conflict.suggestedPort} 并启动？`);
      if (replace) {
        const updated = await window.serveManager.updateService({ ...service, port: conflict.suggestedPort });
        await window.serveManager.startService(updated.id);
      }
    }
    await reload();
  };

  return (
    <main className="app-shell">
      <Toolbar
        query={query}
        statusFilter={statusFilter}
        onQueryChange={setQuery}
        onStatusFilterChange={setStatusFilter}
        onAddProject={() => void addProject()}
        onAddService={() => void addService()}
        onStopAll={() => void window.serveManager.stopAllServices().then(reload)}
      />

      <section className="content-shell">
        {filteredProjects.length === 0 ? (
          <div className="empty-state">还没有服务，先添加一个项目。</div>
        ) : (
          filteredProjects.map((project) => (
            <ProjectGroup
              key={project.id}
              project={project}
              onStart={(service) => void startService(service)}
              onStop={(service) => void window.serveManager.stopService(service.id).then(reload)}
              onLogs={setActiveLogService}
              onCommands={setActiveCommandService}
              onEdit={(service) =>
                setEditor({
                  title: "编辑服务",
                  draft: {
                    name: service.name,
                    servicePath: service.servicePath,
                    stack: service.stack,
                    command: service.command,
                    port: service.port,
                    note: service.note
                  },
                  projectId: service.projectId,
                  service
                })
              }
              onDelete={(service) => {
                if (window.confirm(`删除服务「${service.name}」？不会删除项目文件。`)) {
                  void window.serveManager.deleteService(service.id).then(reload);
                }
              }}
            />
          ))
        )}
      </section>

      {importState && (
        <ImportDialog
          state={importState}
          setState={setImportState}
          onCancel={() => setImportState(null)}
          onSave={async () => {
            await window.serveManager.saveProject({
              name: importState.projectName,
              rootPath: importState.rootPath,
              services: importState.drafts
            });
            setImportState(null);
            await reload();
          }}
        />
      )}

      {editor && (
        <ServiceEditor
          editor={editor}
          projects={projects}
          setEditor={setEditor}
          onCancel={() => setEditor(null)}
          onSave={() => void saveEditor()}
        />
      )}

      {activeLogService && (
        <LogsDrawer
          service={activeLogService}
          logs={logs}
          onClose={() => setActiveLogService(null)}
          onClear={() => void window.serveManager.clearLogs(activeLogService.id).then(() => setLogs([]))}
        />
      )}

      {activeCommandService && <CommandDrawer service={activeCommandService} onClose={() => setActiveCommandService(null)} />}
    </main>
  );
}

function DesktopOnly(): JSX.Element {
  return (
    <main className="desktop-only">
      <h1>Serve Manager</h1>
      <p>请在桌面应用窗口中使用，浏览器页面没有本地服务管理权限。</p>
    </main>
  );
}

function Toolbar(props: {
  query: string;
  statusFilter: StatusFilter;
  onQueryChange(value: string): void;
  onStatusFilterChange(value: StatusFilter): void;
  onAddProject(): void;
  onAddService(): void;
  onStopAll(): void;
}): JSX.Element {
  return (
    <header className="toolbar">
      <div className="brand">Serve Manager</div>
      <button className="primary-button" onClick={props.onAddProject}>
        <FolderPlus size={16} /> 添加项目
      </button>
      <button className="tool-button" onClick={props.onAddService}>
        <Plus size={16} /> 手动添加服务
      </button>
      <input value={props.query} onChange={(event) => props.onQueryChange(event.target.value)} placeholder="搜索服务、命令、备注或路径" />
      <select value={props.statusFilter} onChange={(event) => props.onStatusFilterChange(event.target.value as StatusFilter)}>
        <option value="all">全部状态</option>
        <option value="running">运行中</option>
        <option value="stopped">已停止</option>
        <option value="failed">失败</option>
      </select>
      <button className="tool-button danger" onClick={props.onStopAll}>
        <Square size={16} /> 停止全部
      </button>
    </header>
  );
}

function ProjectGroup(props: {
  project: ProjectWithServices;
  onStart(service: Service): void;
  onStop(service: Service): void;
  onLogs(service: Service): void;
  onCommands(service: Service): void;
  onEdit(service: Service): void;
  onDelete(service: Service): void;
}): JSX.Element {
  const running = props.project.services.filter((service) => service.lastStatus === "running").length;
  return (
    <section className="project-group">
      <header className="project-heading">
        <div>
          <h2>{props.project.name}</h2>
          <p>{props.project.rootPath}</p>
        </div>
        <span>{running}/{props.project.services.length} 运行中</span>
      </header>
      <div className="service-table">
        {props.project.services.map((service) => (
          <ServiceRow key={service.id} service={service} {...props} />
        ))}
      </div>
    </section>
  );
}

function ServiceRow(props: {
  service: Service;
  onStart(service: Service): void;
  onStop(service: Service): void;
  onLogs(service: Service): void;
  onCommands(service: Service): void;
  onEdit(service: Service): void;
  onDelete(service: Service): void;
}): JSX.Element {
  const isRunning = props.service.lastStatus === "running" || props.service.lastStatus === "starting";
  return (
    <div className="service-row">
      <span className={`status-dot ${props.service.lastStatus}`} />
      <div className="service-name">
        <strong>{props.service.name}</strong>
        <small>{props.service.servicePath}</small>
      </div>
      <span>{STACK_LABELS[props.service.stack]}</span>
      <span>{props.service.port ?? "-"}</span>
      <code>{props.service.command || "未配置命令"}</code>
      <span className="note-text">{props.service.note}</span>
      <div className="row-actions">
        <button title="启动" disabled={isRunning} onClick={() => props.onStart(props.service)}>
          <Play size={15} />
        </button>
        <button title="停止" disabled={!isRunning} onClick={() => props.onStop(props.service)}>
          <Square size={15} />
        </button>
        <button title="日志" onClick={() => props.onLogs(props.service)}>
          <FileText size={15} />
        </button>
        <button title="命令" onClick={() => props.onCommands(props.service)}>
          <Terminal size={15} />
        </button>
        <button title="编辑" disabled={isRunning} onClick={() => props.onEdit(props.service)}>
          <Pencil size={15} />
        </button>
        <button title="删除" disabled={isRunning} onClick={() => props.onDelete(props.service)}>
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}

function CommandDrawer(props: { service: Service; onClose(): void }): JSX.Element {
  const [commands, setCommands] = useState<ServiceCommand[]>([]);
  const [selected, setSelected] = useState<ServiceCommand | null>(null);
  const [logs, setLogs] = useState<CommandLogEntry[]>([]);
  const [draft, setDraft] = useState<ServiceCommandDraft>({ name: "", command: "", kind: "task" });
  const [editDraft, setEditDraft] = useState<ServiceCommandDraft>({ name: "", command: "", kind: "task" });

  const loadCommands = async (): Promise<void> => {
    const items = await window.serveManager.listCommands(props.service.id);
    setCommands(items);
    setSelected((current) => {
      if (current) return items.find((item) => item.id === current.id) ?? items[0] ?? null;
      return items[0] ?? null;
    });
  };

  useEffect(() => {
    void loadCommands();
    const offCommand = window.serveManager.onCommandChanged((changed) => {
      setCommands((current) => current.map((item) => (item.id === changed.id ? changed : item)));
      setSelected((current) => (current?.id === changed.id ? changed : current));
    });
    const offLog = window.serveManager.onCommandLog((entry) => {
      setLogs((current) => (selected?.id === entry.commandId ? [...current, entry] : current));
    });
    return () => {
      offCommand();
      offLog();
    };
  }, [props.service.id, selected?.id]);

  useEffect(() => {
    if (!selected) {
      setLogs([]);
      return;
    }
    void window.serveManager.getCommandLogs(selected.id).then(setLogs);
  }, [selected?.id]);

  useEffect(() => {
    if (!selected) {
      setEditDraft({ name: "", command: "", kind: "task" });
      return;
    }
    setEditDraft({ name: selected.name, command: selected.command, kind: selected.kind });
  }, [selected?.id]);

  const saveDraft = async (): Promise<void> => {
    if (!draft.name.trim() || !draft.command.trim()) return;
    await window.serveManager.saveCommand({ ...draft, serviceId: props.service.id });
    setDraft({ name: "", command: "", kind: "task" });
    await loadCommands();
  };

  const saveSelected = async (): Promise<void> => {
    if (!selected) return;
    if (!editDraft.name.trim() || !editDraft.command.trim()) return;
    const updated = await window.serveManager.updateCommand({
      ...selected,
      name: editDraft.name.trim(),
      command: editDraft.command.trim(),
      kind: editDraft.kind
    });
    setSelected(updated);
    await loadCommands();
  };

  const selectedRunning = selected?.lastStatus === "running";
  const selectedBusy = selectedRunning || selected?.lastStatus === "stopping";
  const selectedDirty = selected
    ? editDraft.name !== selected.name || editDraft.command !== selected.command || editDraft.kind !== selected.kind
    : false;
  const logText = logs.map((entry) => `[${entry.stream}] ${entry.content}`).join("");

  return (
    <aside className="commands-drawer">
      <header>
        <div>
          <h2>{props.service.name} 的命令</h2>
          <p>{props.service.servicePath}</p>
        </div>
        <button onClick={props.onClose} title="关闭">
          <X size={16} />
        </button>
      </header>

      <section className="command-manager">
        <div className="command-list">
          {commands.map((command) => (
            <button className={selected?.id === command.id ? "selected" : ""} key={command.id} onClick={() => setSelected(command)}>
              <span>{command.name}</span>
              <small>{command.kind === "long-running" ? "长期" : "一次性"} · {COMMAND_STATUS_LABELS[command.lastStatus]}</small>
            </button>
          ))}
        </div>

        <div className="command-detail">
          {selected ? (
            <div className="command-editor">
              <label className="field">
                <span>名称</span>
                <input disabled={selectedBusy} value={editDraft.name} onChange={(event) => setEditDraft({ ...editDraft, name: event.target.value })} />
              </label>
              <label className="field command-input">
                <span>命令</span>
                <input disabled={selectedBusy} value={editDraft.command} onChange={(event) => setEditDraft({ ...editDraft, command: event.target.value })} />
              </label>
              <label className="field">
                <span>类型</span>
                <select disabled={selectedBusy} value={editDraft.kind} onChange={(event) => setEditDraft({ ...editDraft, kind: event.target.value as CommandKind })}>
                  <option value="task">一次性命令</option>
                  <option value="long-running">长期运行命令</option>
                </select>
              </label>
              <div className="command-actions">
                <button disabled={selectedBusy || !selectedDirty} onClick={() => void saveSelected()}>
                  <Save size={15} /> 保存
                </button>
                <button className="primary-button" disabled={selectedBusy} onClick={() => void window.serveManager.runCommand(selected.id)}>
                  <Play size={15} /> 运行
                </button>
                <button disabled={!selectedRunning} onClick={() => void window.serveManager.stopCommand(selected.id)}>
                  <Square size={15} /> 停止
                </button>
                <button onClick={() => void window.serveManager.clearCommandLogs(selected.id).then(() => setLogs([]))}>
                  <Trash2 size={15} /> 清日志
                </button>
                <button
                  disabled={selectedBusy}
                  onClick={() => {
                    if (window.confirm(`删除命令「${selected.name}」？`)) {
                      void window.serveManager.deleteCommand(selected.id).then(loadCommands);
                    }
                  }}
                >
                  删除
                </button>
              </div>
            </div>
          ) : (
            <div className="empty-command">还没有命令</div>
          )}

          <div className="new-command">
            <strong>新增</strong>
            <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="命令名" />
            <input value={draft.command} onChange={(event) => setDraft({ ...draft, command: event.target.value })} placeholder="命令内容，比如 pnpm build" />
            <select value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as CommandKind })}>
              <option value="task">一次性命令</option>
              <option value="long-running">长期运行命令</option>
            </select>
            <button className="primary-button" onClick={() => void saveDraft()}>
              <Plus size={15} /> 新增
            </button>
          </div>
        </div>
      </section>

      <section className="command-logs">
        <header>
          <strong>{selected ? `${selected.name} 日志` : "命令日志"}</strong>
          <button onClick={() => void navigator.clipboard.writeText(logText)}>
            <Copy size={15} /> 复制
          </button>
        </header>
        <pre>
          {logs.map((entry) => (
            <span className={`log-line ${entry.stream}`} key={entry.id}>
              [{entry.stream}] {entry.content}
            </span>
          ))}
        </pre>
      </section>
    </aside>
  );
}

function ImportDialog(props: {
  state: ImportState;
  setState(next: ImportState | null): void;
  onCancel(): void;
  onSave(): void;
}): JSX.Element {
  const updateDraft = (index: number, draft: ServiceDraft): void => {
    props.setState({ ...props.state, drafts: props.state.drafts.map((item, itemIndex) => (itemIndex === index ? draft : item)) });
  };

  return (
    <div className="modal-backdrop">
      <section className="import-dialog">
        <header>
          <h2>确认扫描结果</h2>
          <p>{props.state.rootPath}</p>
        </header>
        <label>
          项目名
          <input value={props.state.projectName} onChange={(event) => props.setState({ ...props.state, projectName: event.target.value })} />
        </label>
        <div className="import-list">
          {props.state.drafts.map((draft, index) => (
            <DraftFields
              key={`${draft.servicePath}-${index}`}
              draft={draft}
              onChange={(next) => updateDraft(index, next)}
              onRemove={() => props.setState({ ...props.state, drafts: props.state.drafts.filter((_item, itemIndex) => itemIndex !== index) })}
            />
          ))}
        </div>
        <footer>
          <button onClick={props.onCancel}>取消</button>
          <button className="primary-button" disabled={props.state.drafts.length === 0} onClick={props.onSave}>
            保存项目
          </button>
        </footer>
      </section>
    </div>
  );
}

function ServiceEditor(props: {
  editor: EditorState;
  projects: ProjectWithServices[];
  setEditor(next: EditorState): void;
  onCancel(): void;
  onSave(): void;
}): JSX.Element {
  return (
    <div className="modal-backdrop">
      <section className="service-editor">
        <h2>{props.editor.title}</h2>
        <label>
          所属项目
          <select value={props.editor.projectId ?? ""} onChange={(event) => props.setEditor({ ...props.editor, projectId: Number(event.target.value) })}>
            {props.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <DraftFields draft={props.editor.draft} onChange={(draft) => props.setEditor({ ...props.editor, draft })} />
        <footer>
          <button onClick={props.onCancel}>取消</button>
          <button className="primary-button" onClick={props.onSave}>
            保存
          </button>
        </footer>
      </section>
    </div>
  );
}

function DraftFields(props: { draft: ServiceDraft; onChange(draft: ServiceDraft): void; onRemove?(): void }): JSX.Element {
  const set = (patch: Partial<ServiceDraft>): void => props.onChange({ ...props.draft, ...patch });
  return (
    <div className="draft-fields">
      <input value={props.draft.name} onChange={(event) => set({ name: event.target.value })} placeholder="服务名" />
      <select value={props.draft.stack} onChange={(event) => set({ stack: event.target.value as ServiceStack })}>
        {stackOptions.map((stack) => (
          <option key={stack} value={stack}>
            {STACK_LABELS[stack]}
          </option>
        ))}
      </select>
      <input value={props.draft.servicePath} onChange={(event) => set({ servicePath: event.target.value })} placeholder="服务目录" />
      <input value={props.draft.command} onChange={(event) => set({ command: event.target.value })} placeholder="启动命令" />
      <input value={props.draft.port ?? ""} onChange={(event) => set({ port: event.target.value ? Number(event.target.value) : null })} placeholder="端口" />
      <input value={props.draft.note} onChange={(event) => set({ note: event.target.value })} placeholder="备注" />
      {props.onRemove && <button onClick={props.onRemove}>删除</button>}
    </div>
  );
}

function LogsDrawer(props: { service: Service; logs: LogEntry[]; onClose(): void; onClear(): void }): JSX.Element {
  const text = props.logs.map((entry) => `[${entry.stream}] ${entry.content}`).join("");
  return (
    <aside className="logs-drawer">
      <header>
        <div>
          <h2>{props.service.name}</h2>
          <p>{props.service.command}</p>
        </div>
        <button onClick={props.onClose} title="关闭">
          <X size={16} />
        </button>
      </header>
      <div className="logs-actions">
        <button onClick={() => void navigator.clipboard.writeText(text)}>
          <Copy size={15} /> 复制
        </button>
        <button onClick={props.onClear}>
          <Trash2 size={15} /> 清空
        </button>
      </div>
      <pre>
        {props.logs.map((entry) => (
          <span className={`log-line ${entry.stream}`} key={entry.id}>
            [{entry.stream}] {entry.content}
          </span>
        ))}
      </pre>
    </aside>
  );
}
