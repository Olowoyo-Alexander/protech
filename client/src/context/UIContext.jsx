import { createContext, useContext, useState, useCallback } from 'react';

const UIContext = createContext(null);
export const useUI = () => useContext(UIContext);

export function UIProvider({ children }) {
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  // When set, the New Project dialog opens in "collaborate" mode, prefilled with
  // this project's details so the user can review it and join as a co-author.
  const [collabProject, setCollabProject] = useState(null);
  // When set, the New Project dialog opens pre-tagged to this group.
  const [projectGroupId, setProjectGroupId] = useState(null);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const openProject = useCallback((id) => setSelectedProjectId(id), []);
  const closeProject = useCallback(() => setSelectedProjectId(null), []);
  const openNew = useCallback(() => {
    setCollabProject(null);
    setProjectGroupId(null);
    setShowNew(true);
  }, []);
  // Open New Project pre-tagged to a group (used from the group page).
  const openNewForGroup = useCallback((groupId) => {
    setCollabProject(null);
    setProjectGroupId(groupId);
    setShowNew(true);
  }, []);
  // Open the same dialog as New Project, but prefilled for collaborating on an
  // existing (published) project. Closes the detail dialog so they don't stack.
  const openCollab = useCallback((project) => {
    setCollabProject(project);
    setSelectedProjectId(null);
    setShowNew(true);
  }, []);
  const closeNew = useCallback(() => {
    setShowNew(false);
    setCollabProject(null);
    setProjectGroupId(null);
  }, []);
  // Group dialogs (create + detail), mirroring the project equivalents.
  const openNewGroup = useCallback(() => setShowNewGroup(true), []);
  const closeNewGroup = useCallback(() => setShowNewGroup(false), []);
  const openGroup = useCallback((id) => setSelectedGroupId(id), []);
  const closeGroup = useCallback(() => setSelectedGroupId(null), []);

  // Bumping refreshKey makes list pages refetch their data.
  const triggerRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  return (
    <UIContext.Provider
      value={{
        selectedProjectId,
        openProject,
        closeProject,
        showNew,
        openNew,
        closeNew,
        collabProject,
        openCollab,
        projectGroupId,
        openNewForGroup,
        showNewGroup,
        openNewGroup,
        closeNewGroup,
        selectedGroupId,
        openGroup,
        closeGroup,
        refreshKey,
        triggerRefresh,
      }}
    >
      {children}
    </UIContext.Provider>
  );
}
