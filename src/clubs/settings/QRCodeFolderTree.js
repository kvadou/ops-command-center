import React, { useCallback, useEffect, useState } from "react";
import {
  Box,
  Button,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  PlusIcon,
  FolderIcon,
  FolderOpenIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  EllipsisVerticalIcon,
  PencilSquareIcon,
  TrashIcon,
  HomeIcon,
} from "@heroicons/react/24/outline";
import axios from "axios";

/**
 * QR Code Folder Tree Component
 * 
 * Displays a hierarchical folder structure for organizing QR codes
 */
export default function QRCodeFolderTree({ 
  selectedFolderId, 
  onSelectFolder,
  onFolderChange 
}) {
  const [folders, setFolders] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [loading, setLoading] = useState(true);
  
  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [folderName, setFolderName] = useState('');
  const [folderColor, setFolderColor] = useState('#6A469D');
  const [parentFolderId, setParentFolderId] = useState(null);
  
  // Menu state
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuFolder, setMenuFolder] = useState(null);

  const fetchFolders = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/qr-codes/folders/tree');
      setFolders(response.data);
    } catch (err) {
      console.error('Error fetching folders:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  const handleToggleExpand = (folderId) => {
    setExpanded(prev => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  const handleMenuOpen = (event, folder) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
    setMenuFolder(folder);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    setMenuFolder(null);
  };

  const handleCreateFolder = async () => {
    try {
      await axios.post('/api/qr-codes/folders', {
        name: folderName,
        color: folderColor,
        parent_folder_id: parentFolderId,
      });
      setCreateDialogOpen(false);
      setFolderName('');
      setParentFolderId(null);
      fetchFolders();
      onFolderChange?.();
    } catch (err) {
      console.error('Error creating folder:', err);
    }
  };

  const handleEditFolder = async () => {
    try {
      await axios.put(`/api/qr-codes/folders/${selectedFolder.id}`, {
        name: folderName,
        color: folderColor,
      });
      setEditDialogOpen(false);
      setSelectedFolder(null);
      setFolderName('');
      fetchFolders();
      onFolderChange?.();
    } catch (err) {
      console.error('Error updating folder:', err);
    }
  };

  const handleDeleteFolder = async () => {
    try {
      await axios.delete(`/api/qr-codes/folders/${selectedFolder.id}`);
      setDeleteDialogOpen(false);
      setSelectedFolder(null);
      if (selectedFolderId === selectedFolder.id) {
        onSelectFolder(null);
      }
      fetchFolders();
      onFolderChange?.();
    } catch (err) {
      console.error('Error deleting folder:', err);
    }
  };

  const openEditDialog = (folder) => {
    setSelectedFolder(folder);
    setFolderName(folder.name);
    setFolderColor(folder.color || '#6A469D');
    setEditDialogOpen(true);
    handleMenuClose();
  };

  const openDeleteDialog = (folder) => {
    setSelectedFolder(folder);
    setDeleteDialogOpen(true);
    handleMenuClose();
  };

  const openCreateSubfolder = (folder) => {
    setParentFolderId(folder.id);
    setFolderName('');
    setCreateDialogOpen(true);
    handleMenuClose();
  };

  const renderFolder = (folder, depth = 0) => (
    <React.Fragment key={folder.id}>
      <ListItemButton
        selected={selectedFolderId === folder.id}
        onClick={() => onSelectFolder(folder.id)}
        sx={{ pl: 2 + depth * 2 }}
      >
        <ListItemIcon sx={{ minWidth: 36 }}>
          {folder.children?.length > 0 ? (
            <IconButton 
              size="small" 
              onClick={(e) => { e.stopPropagation(); handleToggleExpand(folder.id); }}
              sx={{ p: 0, mr: 0.5 }}
            >
              {expanded[folder.id] ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
            </IconButton>
          ) : (
            <Box sx={{ width: 24 }} />
          )}
          {expanded[folder.id] ? (
            <FolderOpenIcon className="h-5 w-5" style={{ color: folder.color || '#6A469D' }} />
          ) : (
            <FolderIcon className="h-5 w-5" style={{ color: folder.color || '#6A469D' }} />
          )}
        </ListItemIcon>
        <ListItemText 
          primary={folder.name}
          secondary={folder.qr_code_count > 0 ? `${folder.qr_code_count} QR codes` : null}
          primaryTypographyProps={{ variant: 'body2', noWrap: true }}
          secondaryTypographyProps={{ variant: 'caption' }}
        />
        <IconButton 
          size="small" 
          onClick={(e) => handleMenuOpen(e, folder)}
          sx={{ opacity: 0.5, '&:hover': { opacity: 1 } }}
        >
          <EllipsisVerticalIcon className="h-4 w-4" />
        </IconButton>
      </ListItemButton>
      
      {folder.children?.length > 0 && (
        <Collapse in={expanded[folder.id]} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            {folder.children.map(child => renderFolder(child, depth + 1))}
          </List>
        </Collapse>
      )}
    </React.Fragment>
  );

  const PRESET_COLORS = [
    '#6A469D', '#50C8DF', '#34B256', '#F79A30', '#DA2E72', '#2D2F8E', '#FACC29', '#000000'
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1 }}>
        <Typography variant="subtitle2" fontWeight="bold" color="primary">
          Folders
        </Typography>
        <Tooltip title="New Folder">
          <IconButton size="small" onClick={() => { setParentFolderId(null); setCreateDialogOpen(true); }}>
            <PlusIcon className="h-4 w-4" />
          </IconButton>
        </Tooltip>
      </Box>

      <List dense>
        {/* All QR Codes (root) */}
        <ListItemButton
          selected={selectedFolderId === null}
          onClick={() => onSelectFolder(null)}
        >
          <ListItemIcon sx={{ minWidth: 36 }}>
            <HomeIcon className="h-5 w-5" />
          </ListItemIcon>
          <ListItemText 
            primary="All QR Codes"
            primaryTypographyProps={{ variant: 'body2' }}
          />
        </ListItemButton>

        {/* Folder tree */}
        {folders.map(folder => renderFolder(folder))}
      </List>

      {/* Context Menu */}
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={handleMenuClose}>
        <MenuItem onClick={() => openCreateSubfolder(menuFolder)}>
          <PlusIcon className="h-4 w-4 mr-2" /> New Subfolder
        </MenuItem>
        <MenuItem onClick={() => openEditDialog(menuFolder)}>
          <PencilSquareIcon className="h-4 w-4 mr-2" /> Rename
        </MenuItem>
        <MenuItem onClick={() => openDeleteDialog(menuFolder)} sx={{ color: 'error.main' }}>
          <TrashIcon className="h-4 w-4 mr-2" /> Delete
        </MenuItem>
      </Menu>

      {/* Create Folder Dialog */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>
          {parentFolderId ? 'Create Subfolder' : 'Create Folder'}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Folder Name"
            fullWidth
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
            Color
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
            {PRESET_COLORS.map(color => (
              <Box
                key={color}
                onClick={() => setFolderColor(color)}
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: 1,
                  bgcolor: color,
                  cursor: 'pointer',
                  border: folderColor === color ? '2px solid' : '1px solid',
                  borderColor: folderColor === color ? 'primary.main' : 'divider',
                }}
              />
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreateFolder} variant="contained" disabled={!folderName.trim()}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Folder Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Rename Folder</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Folder Name"
            fullWidth
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
            Color
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
            {PRESET_COLORS.map(color => (
              <Box
                key={color}
                onClick={() => setFolderColor(color)}
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: 1,
                  bgcolor: color,
                  cursor: 'pointer',
                  border: folderColor === color ? '2px solid' : '1px solid',
                  borderColor: folderColor === color ? 'primary.main' : 'divider',
                }}
              />
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleEditFolder} variant="contained" disabled={!folderName.trim()}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Folder Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Folder</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{selectedFolder?.name}"?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            QR codes in this folder will be moved to the root level.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteFolder} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
