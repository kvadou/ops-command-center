
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ConfirmationModal from '../../components/ConfirmationModal';
import {
  AppBar,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  ImageList,
  ImageListItem,
  InputAdornment,
  LinearProgress,
  Menu,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
  Tabs,
  Tab,
  Select,
  FormControl,
  InputLabel,
} from "@mui/material";
import {
  TrashIcon,
  ArrowUpTrayIcon,
  ArrowPathIcon,
  MagnifyingGlassPlusIcon,
  LinkIcon,
  EllipsisVerticalIcon,
  MagnifyingGlassIcon,
  ArrowsRightLeftIcon,
  InformationCircleIcon,
  BuildingOfficeIcon,
  UserIcon,
  PhotoIcon,
  FolderIcon,
  FolderOpenIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline';
import { CheckIcon } from '@heroicons/react/24/solid';
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Divider from "@mui/material/Divider";
import DialogActions from "@mui/material/DialogActions";
import Badge from "@mui/material/Badge";
import axios from "axios";

const DROP_BORDER = {
  border: '2px dashed',
  borderColor: 'divider',
  borderRadius: 2,
  p: 3,
  textAlign: 'center',
  bgcolor: 'background.default'
};

export default function ImagesManager() {
  const [images, setImages] = useState([]); 
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");
  const [selectedUrl, setSelectedUrl] = useState(null); // preview dialog
  
  // folder management
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState('all');
  const [selectedUploadFolder, setSelectedUploadFolder] = useState('general');

  // uploads
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef(null);

  // row menu
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuUrl, setMenuUrl] = useState(null);
  
  // usage tracking
  const [usageData, setUsageData] = useState({});
  const [loadingUsage, setLoadingUsage] = useState({});
  const [usageDialogOpen, setUsageDialogOpen] = useState(false);
  const [selectedImageForUsage, setSelectedImageForUsage] = useState(null);
  
  // move to folder
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [selectedImageForMove, setSelectedImageForMove] = useState(null);
  const [moveTargetFolder, setMoveTargetFolder] = useState('booking-forms');
  const [movingImage, setMovingImage] = useState(false);

  // rename image
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [selectedImageForRename, setSelectedImageForRename] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [renamingImage, setRenamingImage] = useState(false);

  // replace image
  const [replaceDialogOpen, setReplaceDialogOpen] = useState(false);
  const [selectedImageForReplace, setSelectedImageForReplace] = useState(null);
  const [replaceInServices, setReplaceInServices] = useState(true);
  const [replaceInTutors, setReplaceInTutors] = useState(true);
  const [replacingImage, setReplacingImage] = useState(false);
  const replaceFileInputRef = useRef(null);

  // Fetch folders
  const fetchFolders = useCallback(async () => {
    try {
      const { data } = await axios.get("/api/images/folders");
      setFolders(Array.isArray(data.folders) ? data.folders : []);
    } catch (e) {
      console.error('Failed to fetch folders:', e);
    }
  }, []);

  // Filter images by folder and search query
  const filtered = useMemo(() => {
    let filteredImages = images;
    
    // Filter by folder
    if (selectedFolder && selectedFolder !== 'all') {
      filteredImages = filteredImages.filter((img) => {
        const imageUrl = typeof img === 'string' ? img : img.url;
        const imageFolder = img.folder || 'general';
        return imageFolder === selectedFolder;
      });
    }
    
    // Filter by search query
    const q = query.trim().toLowerCase();
    if (q) {
      filteredImages = filteredImages.filter((img) => {
        const imageUrl = typeof img === 'string' ? img : img.url;
        const imageFolder = img.folder || 'general';
        const imageName = img.displayName || '';
        return imageUrl.toLowerCase().includes(q) ||
               imageFolder.toLowerCase().includes(q) ||
               imageName.toLowerCase().includes(q);
      });
    }
    
    return filteredImages;
  }, [images, query, selectedFolder]);

  const fetchImages = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await axios.get("/api/images", {
        params: { folder: selectedFolder }
      });
      setImages(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Failed to load images");
    } finally {
      setLoading(false);
    }
  }, [selectedFolder]);

  useEffect(() => { 
    fetchFolders();
  }, [fetchFolders]);

  useEffect(() => { 
    fetchImages(); 
  }, [fetchImages]);

  const onDelete = (imageUrl) => {
    setConfirmState({
      isOpen: true,
      title: 'Delete Image',
      message: 'Delete this image? This cannot be undone.',
      action: async () => {
        try {
          await axios.delete(`/api/images`, { data: { image: imageUrl } });
          setImages((prev) => prev.filter((img) => {
            const imgUrl = typeof img === 'string' ? img : img.url;
            return imgUrl !== imageUrl;
          }));
          setSnack({ open: true, severity: 'success', msg: 'Image deleted' });
          await fetchFolders();
        } catch (e) {
          setSnack({ open: true, severity: 'error', msg: e?.response?.data?.message || 'Delete failed' });
        }
      },
    });
  };

  const [snack, setSnack] = useState({ open: false, severity: 'success', msg: '' });
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '' });

  const onUploadFiles = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    setProgress(0);
    try {
      // upload sequentially to keep onUploadProgress accurate; change to Promise.all if server supports it
      for (let i = 0; i < files.length; i++) {
        const formData = new FormData();
        formData.append('image', files[i]);
        formData.append('folder', selectedUploadFolder);
        await axios.post('/api/images', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (e) => {
            if (e.total) {
              const pct = Math.round((e.loaded / e.total) * 100);
              
              const overall = Math.round(((i + pct / 100) / files.length) * 100);
              setProgress(overall);
            }
          }
        });
      }
      setSnack({ open: true, severity: 'success', msg: 'Upload complete' });
      await fetchFolders();
      await fetchImages();
    } catch (e) {
      setSnack({ open: true, severity: 'error', msg: e?.response?.data?.message || 'Upload failed' });
    } finally {
      setUploading(false);
      setProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileInput = (e) => onUploadFiles(e.target.files);

  // drag and drop
  const [isDragging, setDragging] = useState(false);
  const onDrop = async (e) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files || []).filter(f => f.type.startsWith('image/'));
    onUploadFiles(files);
  };

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); setSnack({ open: true, severity: 'success', msg: 'URL copied' }); }
    catch { setSnack({ open: true, severity: 'error', msg: 'Failed to copy' }); }
  };

  
  const openMenuFor = (event, url) => { setMenuAnchor(event.currentTarget); setMenuUrl(url); };
  const closeMenu = () => { setMenuAnchor(null); setMenuUrl(null); };
  
  // Fetch usage data for an image
  const fetchUsage = useCallback(async (imageUrl) => {
    if (!imageUrl) return;
    
    // Check cache first
    if (usageData[imageUrl]) {
      setSelectedImageForUsage(imageUrl);
      setUsageDialogOpen(true);
      return;
    }
    
    setLoadingUsage(prev => ({ ...prev, [imageUrl]: true }));
    try {
      const { data } = await axios.get('/api/images/usage', {
        params: { imageUrl: encodeURIComponent(imageUrl) }
      });
      setUsageData(prev => ({ ...prev, [imageUrl]: data }));
      setSelectedImageForUsage(imageUrl);
      setUsageDialogOpen(true);
    } catch (e) {
      setSnack({ open: true, severity: 'error', msg: e?.response?.data?.message || 'Failed to fetch usage data' });
    } finally {
      setLoadingUsage(prev => ({ ...prev, [imageUrl]: false }));
    }
  }, [usageData]);
  
  // Handle replace image
  const handleReplaceImage = (imageUrl) => {
    setSelectedImageForReplace(imageUrl);
    setReplaceInServices(true);
    setReplaceInTutors(true);
    setReplaceDialogOpen(true);
    closeMenu();
  };
  
  // Handle move image to folder
  const handleMoveImage = (url) => {
    setSelectedImageForMove(url);
    setMoveTargetFolder('booking-forms');
    setMoveDialogOpen(true);
    closeMenu();
  };

  // Execute move to folder
  const executeMove = async () => {
    if (!selectedImageForMove) return;
    const img = images.find(i => {
      const url = typeof i === 'string' ? i : i.url;
      return url === selectedImageForMove;
    });
    const publicId = img?.publicId;
    if (!publicId) {
      setSnack({ open: true, severity: 'error', msg: 'Could not determine image public ID' });
      return;
    }
    setMovingImage(true);
    try {
      const { data } = await axios.post('/api/images/move', {
        publicId,
        targetFolder: moveTargetFolder
      });
      setSnack({ open: true, severity: 'success', msg: data.message || 'Image moved successfully' });
      setMoveDialogOpen(false);
      setSelectedImageForMove(null);
      await fetchFolders();
      await fetchImages();
    } catch (e) {
      setSnack({ open: true, severity: 'error', msg: e?.response?.data?.error || 'Failed to move image' });
    } finally {
      setMovingImage(false);
    }
  };

  // Execute image replacement
  const executeReplace = async () => {
    if (!selectedImageForReplace || !replaceFileInputRef.current?.files?.length) return;
    
    setReplacingImage(true);
    try {
      const formData = new FormData();
      formData.append('newImage', replaceFileInputRef.current.files[0]);
      formData.append('oldImageUrl', selectedImageForReplace);
      formData.append('replaceInServices', replaceInServices);
      formData.append('replaceInTutors', replaceInTutors);
      
      const { data } = await axios.post('/api/images/replace', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      setSnack({ open: true, severity: 'success', msg: data.message || 'Image replaced successfully' });
      setReplaceDialogOpen(false);
      setSelectedImageForReplace(null);
      replaceFileInputRef.current.value = '';
      
      // Refresh images and clear usage cache for replaced image
      await fetchImages();
      setUsageData(prev => {
        const newData = { ...prev };
        delete newData[selectedImageForReplace];
        if (data.newImageUrl) {
          delete newData[data.newImageUrl];
        }
        return newData;
      });
    } catch (e) {
      setSnack({ open: true, severity: 'error', msg: e?.response?.data?.message || 'Failed to replace image' });
    } finally {
      setReplacingImage(false);
    }
  };

  // Handle rename image
  const handleRenameImage = (url) => {
    const img = images.find(i => {
      const u = typeof i === 'string' ? i : i.url;
      return u === url;
    });
    setSelectedImageForRename(url);
    setRenameValue(img?.displayName || '');
    setRenameDialogOpen(true);
    closeMenu();
  };

  const executeRename = async () => {
    if (!selectedImageForRename || !renameValue.trim()) return;
    const img = images.find(i => {
      const u = typeof i === 'string' ? i : i.url;
      return u === selectedImageForRename;
    });
    const publicId = img?.publicId;
    if (!publicId) {
      setSnack({ open: true, severity: 'error', msg: 'Could not determine image public ID' });
      return;
    }
    setRenamingImage(true);
    try {
      const { data } = await axios.put('/api/images/rename', {
        publicId,
        displayName: renameValue.trim()
      });
      setSnack({ open: true, severity: 'success', msg: data.message || 'Image renamed' });
      setRenameDialogOpen(false);
      // Update local state without full refetch
      setImages(prev => prev.map(i => {
        const u = typeof i === 'string' ? i : i.url;
        if (u === selectedImageForRename) {
          return { ...i, displayName: renameValue.trim() };
        }
        return i;
      }));
    } catch (e) {
      setSnack({ open: true, severity: 'error', msg: e?.response?.data?.error || 'Failed to rename image' });
    } finally {
      setRenamingImage(false);
    }
  };

  // Get image URL from image object or string
  const getImageUrl = (img) => typeof img === 'string' ? img : img.url;
  
  // Get folder from image object or extract from URL
  const getImageFolder = (img) => {
    if (typeof img === 'object' && img.folder) {
      return img.folder;
    }
    const url = typeof img === 'string' ? img : img.url;
    try {
      const match = url.match(/\/upload\/v\d+\/(.+?)\//);
      if (match && match[1]) {
        const parts = match[1].split('/');
        return parts.length > 1 ? parts[1] : 'general';
      }
    } catch { }
    return 'general';
  };

  return (
    <Box>
      <AppBar position="static" color="transparent" elevation={0} sx={{ mb: 2 }}>
        <Toolbar disableGutters sx={{ gap: 1, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <Typography variant="h6" fontWeight={700}>Images</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
            <TextField
              size="small"
              placeholder="Search images..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              InputProps={{ startAdornment: (
                <InputAdornment position="start"><MagnifyingGlassIcon className="h-5 w-5" /></InputAdornment>
              )}}
              sx={{ minWidth: 200 }}
            />
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Upload to Folder</InputLabel>
              <Select
                value={selectedUploadFolder}
                label="Upload to Folder"
                onChange={(e) => setSelectedUploadFolder(e.target.value)}
              >
                {folders.map((folder) => (
                  <MenuItem key={folder.id} value={folder.id}>
                    {folder.name} {folder.count > 0 && `(${folder.count})`}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Tooltip title="Refresh">
              <IconButton onClick={() => { fetchFolders(); fetchImages(); }}><ArrowPathIcon className="h-5 w-5" /></IconButton>
            </Tooltip>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={handleFileInput}
            />
            <Button
              variant="contained"
              startIcon={<ArrowUpTrayIcon className="h-5 w-5" />}
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              Upload Images
            </Button>
          </Stack>
        </Toolbar>
        {(loading || uploading) && <LinearProgress variant={uploading && progress ? 'determinate' : 'indeterminate'} value={progress} />}
      </AppBar>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Folder Tabs */}
      {folders.length > 0 && (
        <Paper sx={{ mb: 2 }}>
          <Tabs
            value={selectedFolder}
            onChange={(e, newValue) => setSelectedFolder(newValue)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ borderBottom: 1, borderColor: 'divider' }}
          >
            <Tab 
              label={
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <FolderOpenIcon className="h-5 w-5" />
                  <span>All Images</span>
                </Stack>
              } 
              value="all" 
            />
            {folders.map((folder) => (
              <Tab
                key={folder.id}
                label={
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <FolderIcon className="h-5 w-5" />
                    <span>{folder.name}</span>
                    {folder.count > 0 && (
                      <Chip size="small" label={folder.count} sx={{ ml: 0.5, height: 20 }} />
                    )}
                  </Stack>
                }
                value={folder.id}
              />
            ))}
          </Tabs>
        </Paper>
      )}

      {/* Upload Drop Zone */}
      <Paper
        sx={{ ...DROP_BORDER, mb: 2, py: 4, ...(isDragging ? { bgcolor: 'action.hover' } : {}) }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <Stack alignItems="center" spacing={1}>
          <ArrowUpTrayIcon className="h-5 w-5" />
          <Typography variant="body2">Drag & drop images here or use the Upload button</Typography>
          <Typography variant="caption" color="text.secondary">
            Uploading to: <strong>{folders.find(f => f.id === selectedUploadFolder)?.name || selectedUploadFolder}</strong>
          </Typography>
        </Stack>
      </Paper>

      {}
      <Paper sx={{ p: 2 }}>
        {loading && (
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
            <CircularProgress size={20} />
            <Typography variant="body2" color="text.secondary">Loading…</Typography>
          </Stack>
        )}

        {!loading && filtered.length === 0 && (
          <Stack alignItems="center" spacing={1} sx={{ py: 6 }}>
            <Typography>No images found</Typography>
            <Button variant="outlined" startIcon={<ArrowUpTrayIcon className="h-5 w-5" />} onClick={() => fileInputRef.current?.click()}>Upload</Button>
          </Stack>
        )}

        <ImageList variant="masonry" cols={Math.max(1, typeof window !== 'undefined' && window.innerWidth < 600 ? 1 : 3)} gap={12}>
          {filtered.map((img) => {
            const imageUrl = getImageUrl(img);
            const imageFolder = getImageFolder(img);
            return (
              <ImageListItem key={imageUrl} sx={{ position: 'relative' }}>
                <Box
                  component="img"
                  src={imageUrl}
                  alt="uploaded"
                  loading="lazy"
                  sx={{ width: '100%', borderRadius: 2, boxShadow: 1, cursor: 'zoom-in' }}
                  onClick={() => setSelectedUrl(imageUrl)}
                />

                {img.displayName && (
                  <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, bgcolor: 'rgba(0,0,0,0.6)', px: 1, py: 0.5, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 }}>
                    <Typography variant="caption" sx={{ color: 'white', fontWeight: 600 }}>{img.displayName}</Typography>
                  </Box>
                )}
                <Stack direction="row" spacing={1} sx={{ position: 'absolute', top: 8, right: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {usageData[imageUrl]?.totalCount > 0 && (
                    <Badge badgeContent={usageData[imageUrl].totalCount} color="primary">
                      <InformationCircleIcon className="h-5 w-5" style={{ color: 'white', backgroundColor: '#1976d2', borderRadius: '50%', padding: 2 }} />
                    </Badge>
                  )}
                  {imageFolder && imageFolder !== 'general' && (
                    <Chip 
                      size="small" 
                      label={folders.find(f => f.id === imageFolder)?.name || imageFolder}
                      icon={<FolderIcon className="h-5 w-5" />}
                      sx={{ bgcolor: 'background.paper' }} 
                    />
                  )}
                  <Tooltip title="More">
                    <IconButton size="small" onClick={(e) => openMenuFor(e, imageUrl)} sx={{ bgcolor: 'background.paper' }}>
                      <EllipsisVerticalIcon className="h-5 w-5" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </ImageListItem>
            );
          })}
        </ImageList>
      </Paper>

      {}
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu}>
        <MenuItem onClick={() => { setSelectedUrl(menuUrl); closeMenu(); }}><MagnifyingGlassPlusIcon className="h-5 w-5" style={{ marginRight: 8 }} /> Preview</MenuItem>
        <MenuItem onClick={() => { fetchUsage(menuUrl); }} disabled={loadingUsage[menuUrl]}>
          <InformationCircleIcon className="h-5 w-5" style={{ marginRight: 8 }} />
          {loadingUsage[menuUrl] ? 'Loading usage...' : 'View Usage'}
        </MenuItem>
        <MenuItem onClick={() => { handleRenameImage(menuUrl); }}><PencilSquareIcon className="h-5 w-5" style={{ marginRight: 8 }} /> Rename</MenuItem>
        <MenuItem onClick={() => { handleReplaceImage(menuUrl); }}><ArrowsRightLeftIcon className="h-5 w-5" style={{ marginRight: 8 }} /> Replace Image</MenuItem>
        <MenuItem onClick={() => { handleMoveImage(menuUrl); }}><FolderIcon fontSize="small" style={{ marginRight: 8 }} /> Move to Folder</MenuItem>
        <Divider />
        <MenuItem onClick={() => { copy(menuUrl); closeMenu(); }}><LinkIcon className="h-5 w-5" style={{ marginRight: 8 }} /> Copy URL</MenuItem>
        <MenuItem onClick={() => { onDelete(menuUrl); closeMenu(); }}><TrashIcon className="h-5 w-5" style={{ marginRight: 8 }} /> Delete</MenuItem>
      </Menu>

      {}
      <Dialog open={Boolean(selectedUrl)} onClose={() => setSelectedUrl(null)} maxWidth="lg" fullWidth>
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="h6" sx={{ flex: 1, pr: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedUrl}</Typography>
            <Tooltip title="Copy URL"><IconButton onClick={() => copy(selectedUrl)}><LinkIcon className="h-5 w-5" /></IconButton></Tooltip>
            <Tooltip title="Open in new tab"><IconButton component="a" href={selectedUrl} target="_blank" rel="noopener noreferrer"><CheckIcon className="h-5 w-5" /></IconButton></Tooltip>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          <Box component="img" src={selectedUrl || ''} alt="preview" sx={{ width: '100%', borderRadius: 2 }} />
        </DialogContent>
      </Dialog>

      {/* Usage Dialog */}
      <Dialog open={usageDialogOpen} onClose={() => setUsageDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <InformationCircleIcon className="h-5 w-5" />
            <Typography variant="h6">Image Usage</Typography>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          {selectedImageForUsage && (
            <>
              <Box sx={{ mb: 2 }}>
                <Box
                  component="img"
                  src={selectedImageForUsage}
                  alt="preview"
                  sx={{ width: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 2, bgcolor: 'grey.100' }}
                />
              </Box>
              {usageData[selectedImageForUsage] && (
                <>
                  {usageData[selectedImageForUsage].totalCount === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      This image is not currently being used in any services or tutor profiles.
                    </Typography>
                  ) : (
                    <Stack spacing={2}>
                      {usageData[selectedImageForUsage].services.length > 0 && (
                        <Box>
                          <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <BuildingOfficeIcon className="h-5 w-5" />
                            Used in {usageData[selectedImageForUsage].services.length} Service(s):
                          </Typography>
                          <List dense>
                            {usageData[selectedImageForUsage].services.map((service) => (
                              <ListItem key={service.id}>
                                <ListItemText
                                  primary={service.name}
                                  secondary={`Service ID: ${service.id}${service.publicVisible ? ' • Public' : ''}`}
                                />
                              </ListItem>
                            ))}
                          </List>
                        </Box>
                      )}
                      
                      {usageData[selectedImageForUsage].tutors.length > 0 && (
                        <Box>
                          {usageData[selectedImageForUsage].services.length > 0 && <Divider sx={{ my: 2 }} />}
                          <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <UserIcon className="h-5 w-5" />
                            Used in {usageData[selectedImageForUsage].tutors.length} Tutor Profile(s):
                          </Typography>
                          <List dense>
                            {usageData[selectedImageForUsage].tutors.map((tutor) => (
                              <ListItem key={tutor.id}>
                                <ListItemText
                                  primary={tutor.name}
                                  secondary={`Tutor ID: ${tutor.id}${tutor.email ? ` • ${tutor.email}` : ''}`}
                                />
                              </ListItem>
                            ))}
                          </List>
                        </Box>
                      )}
                    </Stack>
                  )}
                </>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUsageDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Replace Image Dialog */}
      <Dialog open={replaceDialogOpen} onClose={() => !replacingImage && setReplaceDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <ArrowsRightLeftIcon className="h-5 w-5" />
            <Typography variant="h6">Replace Image</Typography>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          {selectedImageForReplace && (
            <>
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" gutterBottom>Current Image:</Typography>
                <Box
                  component="img"
                  src={selectedImageForReplace}
                  alt="current"
                  sx={{ width: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 2, bgcolor: 'grey.100' }}
                />
              </Box>
              
              <Box sx={{ mb: 2 }}>
                <input
                  ref={replaceFileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    // Preview new image if needed
                  }}
                />
                <Button
                  variant="outlined"
                  startIcon={<ArrowUpTrayIcon className="h-5 w-5" />}
                  onClick={() => replaceFileInputRef.current?.click()}
                  fullWidth
                  disabled={replacingImage}
                >
                  Select New Image
                </Button>
                {replaceFileInputRef.current?.files?.length > 0 && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="caption" color="text.secondary">Selected: {replaceFileInputRef.current.files[0].name}</Typography>
                  </Box>
                )}
              </Box>
              
              <Divider sx={{ my: 2 }} />
              
              <Typography variant="subtitle2" gutterBottom>Update references in:</Typography>
              <Stack spacing={1}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={replaceInServices}
                      onChange={(e) => setReplaceInServices(e.target.checked)}
                      disabled={replacingImage}
                    />
                  }
                  label="Services (where this image is used as service/club image)"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={replaceInTutors}
                      onChange={(e) => setReplaceInTutors(e.target.checked)}
                      disabled={replacingImage}
                    />
                  }
                  label="Tutor Profiles (where this image is used as tutor photo)"
                />
              </Stack>
              
              {(!replaceInServices && !replaceInTutors) && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  Please select at least one location to update.
                </Alert>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReplaceDialogOpen(false)} disabled={replacingImage}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={executeReplace}
            disabled={replacingImage || !replaceFileInputRef.current?.files?.length || (!replaceInServices && !replaceInTutors)}
            startIcon={replacingImage ? <CircularProgress size={16} /> : <ArrowsRightLeftIcon className="h-5 w-5" />}
          >
            {replacingImage ? 'Replacing...' : 'Replace Image'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Move to Folder Dialog */}
      <Dialog open={moveDialogOpen} onClose={() => !movingImage && setMoveDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <FolderIcon className="h-5 w-5" />
            <Typography variant="h6">Move to Folder</Typography>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          {selectedImageForMove && (
            <>
              <Box sx={{ mb: 3 }}>
                <Box
                  component="img"
                  src={selectedImageForMove}
                  alt="preview"
                  sx={{ width: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 2, bgcolor: 'grey.100' }}
                />
              </Box>
              <FormControl fullWidth>
                <InputLabel>Target Folder</InputLabel>
                <Select
                  value={moveTargetFolder}
                  label="Target Folder"
                  onChange={(e) => setMoveTargetFolder(e.target.value)}
                  disabled={movingImage}
                >
                  {folders.filter(f => f.id !== 'all').map((folder) => (
                    <MenuItem key={folder.id} value={folder.id}>
                      {folder.name} {folder.count > 0 && `(${folder.count})`}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMoveDialogOpen(false)} disabled={movingImage}>Cancel</Button>
          <Button
            variant="contained"
            onClick={executeMove}
            disabled={movingImage}
            startIcon={movingImage ? <CircularProgress size={16} /> : <FolderIcon className="h-5 w-5" />}
          >
            {movingImage ? 'Moving...' : 'Move Image'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onClose={() => !renamingImage && setRenameDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <PencilSquareIcon className="h-5 w-5" />
            <Typography variant="h6">Rename Image</Typography>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          {selectedImageForRename && (
            <>
              <Box sx={{ mb: 2 }}>
                <Box
                  component="img"
                  src={selectedImageForRename}
                  alt="preview"
                  sx={{ width: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 2, bgcolor: 'grey.100' }}
                />
              </Box>
              <TextField
                fullWidth
                label="Display Name"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                disabled={renamingImage}
                autoFocus
                placeholder="e.g. Booking Form 1"
                onKeyDown={(e) => { if (e.key === 'Enter' && renameValue.trim()) executeRename(); }}
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameDialogOpen(false)} disabled={renamingImage}>Cancel</Button>
          <Button
            variant="contained"
            onClick={executeRename}
            disabled={renamingImage || !renameValue.trim()}
            startIcon={renamingImage ? <CircularProgress size={16} /> : <CheckIcon className="h-5 w-5" />}
          >
            {renamingImage ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snack.open}
        autoHideDuration={2500}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setSnack((s) => ({ ...s, open: false }))} severity={snack.severity} variant="filled">
          {snack.msg}
        </Alert>
      </Snackbar>
      <ConfirmationModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(s => ({ ...s, isOpen: false }))}
        onConfirm={() => { confirmState.action?.(); setConfirmState(s => ({ ...s, isOpen: false })); }}
        title={confirmState.title}
        message={confirmState.message}
        isDestructive
      />
    </Box>
  );
}
