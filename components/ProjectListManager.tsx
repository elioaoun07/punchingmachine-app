'use client';

import React, { useState, useEffect } from 'react';
import { Plus, X, FolderOpen } from 'lucide-react';
import { getProjectList, saveProjectList } from '@/lib/db';

export default function ProjectListManager() {
  const [projects, setProjects] = useState<string[]>([]);
  const [newProject, setNewProject] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getProjectList().then((list) => {
      setProjects(list);
      setLoaded(true);
    });
  }, []);

  const handleAdd = async () => {
    const trimmed = newProject.trim();
    if (!trimmed || projects.includes(trimmed)) return;
    const updated = [...projects, trimmed];
    await saveProjectList(updated);
    setProjects(updated);
    setNewProject('');
  };

  const handleRemove = async (name: string) => {
    const updated = projects.filter((p) => p !== name);
    await saveProjectList(updated);
    setProjects(updated);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  if (!loaded) return null;

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <FolderOpen className="w-5 h-5 text-purple-600" />
        <h3 className="font-semibold text-gray-700">Projects</h3>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Manage the project list used in the NFC project logger.
      </p>

      {/* Add new project */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={newProject}
          onChange={(e) => setNewProject(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="New project name..."
          className="flex-1 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700
                     placeholder-gray-400 outline-none focus:border-purple-300 focus:ring-2 focus:ring-purple-100 transition-all"
        />
        <button
          onClick={handleAdd}
          disabled={!newProject.trim() || projects.includes(newProject.trim())}
          className="px-3 py-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors
                     disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>

      {/* Project list */}
      {projects.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">
          No projects yet. Add one above.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {projects.map((project) => (
            <li
              key={project}
              className="flex items-center justify-between px-3 py-2.5 bg-gray-50 rounded-lg group"
            >
              <span className="text-sm text-gray-700">{project}</span>
              <button
                onClick={() => handleRemove(project)}
                className="p-1 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                title="Remove project"
              >
                <X className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
