import React, { useState, useEffect, useCallback } from 'react';
import DOMPurify from 'dompurify';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Button,
  Alert,
  CircularProgress,
  Chip,
  Container,
  TextField,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper
} from '@mui/material';
import { MagnifyingGlassIcon, AcademicCapIcon, MapPinIcon, CurrencyDollarIcon, ExclamationTriangleIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import axios from 'axios';

const PublicSchoolDirectory = () => {
  const [services, setServices] = useState([]);
  const [filteredServices, setFilteredServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [availableLocations, setAvailableLocations] = useState([]);

  const fetchPublicServices = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/public-services/');
      
      if (response.data.success) {
        setServices(response.data.services);
        
        // Extract unique locations for filter
        const locations = [...new Set(response.data.services.map(service => service.location))];
        setAvailableLocations(locations);
      } else {
        setError('Failed to load school directory');
      }
    } catch (err) {
      console.error('Error fetching public services:', err);
      setError('Failed to load school directory. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const filterServices = useCallback(() => {
    let filtered = services;

    // Filter by search term (school name or description)
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(service => 
        service.name.toLowerCase().includes(term) ||
        service.description.toLowerCase().includes(term) ||
        service.location.toLowerCase().includes(term)
      );
    }

    // Filter by location
    if (locationFilter) {
      filtered = filtered.filter(service => 
        service.location === locationFilter
      );
    }

    setFilteredServices(filtered);
  }, [services, searchTerm, locationFilter]);

  useEffect(() => {
    fetchPublicServices();
  }, []);

  useEffect(() => {
    filterServices();
  }, [filterServices]);

  const handleBookingClick = (service) => {
    // Open booking form in new tab
    window.open(service.bookingUrl, '_blank');
  };

  const formatPrice = (price) => {
    if (!price) return 'Contact for pricing';
    return `$${parseFloat(price).toFixed(2)}`;
  };

  const stripHtml = (html) => {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  };

  if (loading) {
    return (
      <Box 
        sx={{
          minHeight: '100vh',
          backgroundImage: `url('https://cdn.prod.website-files.com/64d4e8b883dfdc36c02531c1/673cb1a1775d0cc1d68e4599_C%403Webbackground.jpg')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 4
        }}
      >
        <Box
          sx={{
            backgroundColor: 'white',
            borderRadius: 4,
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            p: 6,
            textAlign: 'center',
            maxWidth: 400
          }}
        >
          <CircularProgress size={60} sx={{ color: '#6A469D', mb: 2 }} />
          <Typography variant="h6" sx={{ color: '#6A469D', fontFamily: 'Poppins, sans-serif' }}>
            Loading school directory...
          </Typography>
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          backgroundImage: `url('https://cdn.prod.website-files.com/64d4e8b883dfdc36c02531c1/673cb1a1775d0cc1d68e4599_C%403Webbackground.jpg')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 4
        }}
      >
        <Box
          sx={{
            backgroundColor: 'white',
            borderRadius: 4,
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            p: 4,
            maxWidth: 500
          }}
        >
          <Alert severity="error" sx={{ borderRadius: 3 }}>
            {error}
          </Alert>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        backgroundImage: `url('https://cdn.prod.website-files.com/64d4e8b883dfdc36c02531c1/673cb1a1775d0cc1d68e4599_C%403Webbackground.jpg')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 4
      }}
    >
      {/* Main Content Card */}
      <Box
        sx={{
          width: '100%',
          maxWidth: '1200px',
          backgroundColor: 'white',
          borderRadius: 4,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden'
        }}
      >
        {/* Header Section with Logo */}
        <Box
          sx={{
            p: 4,
            textAlign: 'center',
            borderBottom: '1px solid #e5e7eb',
            backgroundColor: '#f9fafb'
          }}
        >
          <Box
            component="a"
            href="https://acmeops.com/school-partnerships"
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              display: 'block',
              mb: 3,
              mx: 'auto',
              width: 'fit-content',
              textDecoration: 'none',
              '&:hover': {
                opacity: 0.8,
                transition: 'opacity 0.2s ease-in-out'
              }
            }}
          >
            <Box
              component="img"
              src="/logo512.png"
              alt="Acme Operations Logo"
              sx={{
                height: 80,
                width: 'auto',
                display: 'block'
              }}
            />
          </Box>
          <Typography
            variant="h2"
            component="h1"
            sx={{
              fontFamily: '"Chunk Five", "Poppins", sans-serif',
              fontSize: { xs: '2rem', md: '2.5rem' },
              fontWeight: 'bold',
              color: '#6A469D',
              mb: 2,
              lineHeight: 1.2
            }}
          >
            Find Chess Classes at Your School
          </Typography>
          <Typography
            variant="h6"
            sx={{
              fontFamily: 'Poppins, sans-serif',
              fontWeight: 400,
              color: '#6b7280',
              maxWidth: '600px',
              mx: 'auto',
              lineHeight: 1.4
            }}
          >
            Discover Acme Operations programs available at schools in your area
          </Typography>
        </Box>

        {/* Content Area */}
        <Box sx={{ p: 4 }}>
          {/* Search and Filter Controls */}
          <Paper
            elevation={2}
            sx={{
              p: 3,
              mb: 4,
              borderRadius: 3,
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb'
            }}
          >
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                placeholder="Search by school name or location..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 3,
                    backgroundColor: 'white',
                    '&:hover': {
                      '& .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#6A469D',
                      },
                    },
                    '&.Mui-focused': {
                      '& .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#6A469D',
                        borderWidth: 2,
                      },
                    },
                  },
                }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <MagnifyingGlassIcon className="h-5 w-5" style={{ color: '#6A469D' }} />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <FormControl fullWidth>
                <InputLabel sx={{ color: '#6A469D' }}>Filter by Location</InputLabel>
                <Select
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                  label="Filter by Location"
                  sx={{
                    borderRadius: 3,
                    backgroundColor: 'white',
                    '&:hover': {
                      '& .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#6A469D',
                      },
                    },
                    '&.Mui-focused': {
                      '& .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#6A469D',
                        borderWidth: 2,
                      },
                    },
                  }}
                >
                  <MenuItem value="">All Locations</MenuItem>
                  {availableLocations.map((location) => (
                    <MenuItem key={location} value={location}>
                      {location}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <Box textAlign="center">
                <Chip
                  label={`${filteredServices.length} classes found`}
                  sx={{
                    backgroundColor: '#6A469D',
                    color: 'white',
                    fontWeight: 'bold',
                    fontFamily: 'Poppins, sans-serif',
                    px: 2,
                    py: 1
                  }}
                />
              </Box>
            </Grid>
          </Grid>
        </Paper>


          {/* Services Grid */}
          {filteredServices.length === 0 ? (
            <Paper
              elevation={1}
              sx={{
                p: 6,
                textAlign: 'center',
                borderRadius: 3,
                backgroundColor: '#f9fafb',
                border: '1px solid #e5e7eb'
              }}
            >
              <AcademicCapIcon className="h-20 w-20" style={{ color: '#6A469D', marginBottom: 24 }} />
              <Typography 
                variant="h4" 
                sx={{ 
                  color: '#6A469D', 
                  mb: 2,
                  fontFamily: 'Poppins, sans-serif',
                  fontWeight: 'bold'
                }}
              >
                No classes found
              </Typography>
              <Typography 
                variant="h6" 
                sx={{ 
                  color: '#6b7280',
                  fontFamily: 'Poppins, sans-serif'
                }}
              >
                Try adjusting your search terms or location filter
              </Typography>
            </Paper>
          ) : (
            <Grid container spacing={3}>
              {filteredServices.map((service) => (
                <Grid item xs={12} sm={6} lg={4} key={service.id}>
                  <Card 
                    sx={{ 
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      borderRadius: 3,
                      overflow: 'hidden',
                      transition: 'all 0.3s ease-in-out',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                      border: '1px solid #e5e7eb',
                      '&:hover': {
                        transform: 'translateY(-4px)',
                        boxShadow: '0 8px 20px rgba(0,0,0,0.15)',
                      }
                    }}
                  >
                  {service.image && (
                    <Box
                      component="img"
                      src={service.image}
                      alt={service.name}
                      sx={{
                        width: '100%',
                        height: 200,
                        objectFit: 'cover',
                        borderRadius: '16px 16px 0 0'
                      }}
                    />
                  )}
                  
                  <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', p: 3 }}>
                    <Typography 
                      variant="h6" 
                      component="h2" 
                      sx={{ 
                        mb: 2, 
                        fontWeight: 'bold',
                        fontFamily: 'Poppins, sans-serif',
                        color: '#6A469D',
                        lineHeight: 1.3
                      }}
                    >
                      {service.name}
                    </Typography>
                    
                    {service.description && (
                      <Typography 
                        variant="body2" 
                        color="text.secondary" 
                        sx={{ 
                          mb: 3,
                          fontFamily: 'Poppins, sans-serif',
                          lineHeight: 1.5,
                          display: '-webkit-box',
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          '& p': {
                            margin: 0,
                            marginBottom: '0.5em'
                          },
                          '& ul, & ol': {
                            margin: 0,
                            paddingLeft: '1.5em'
                          },
                          '& strong': {
                            fontWeight: 'bold'
                          },
                          '& em': {
                            fontStyle: 'italic'
                          }
                        }}
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(service.description) }}
                      />
                    )}

                    <Box sx={{ mb: 3, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      <Chip
                        icon={<MapPinIcon className="h-4 w-4" />}
                        label={service.location}
                        size="small"
                        sx={{
                          backgroundColor: '#E8FBFF',
                          color: '#6A469D',
                          border: '1px solid #50C8DF',
                          fontFamily: 'Poppins, sans-serif',
                          fontWeight: 'bold'
                        }}
                      />
                      <Chip
                        icon={<CurrencyDollarIcon className="h-4 w-4" />}
                        label={formatPrice(service.price)}
                        size="small"
                        sx={{
                          backgroundColor: '#FFF3E0',
                          color: '#F79A30',
                          border: '1px solid #F79A30',
                          fontFamily: 'Poppins, sans-serif',
                          fontWeight: 'bold'
                        }}
                      />
                    </Box>

                    {/* Warning for each service */}
                    <Alert 
                      severity="warning" 
                      icon={<ExclamationTriangleIcon className="h-5 w-5" />}
                      sx={{ 
                        mb: 3,
                        borderRadius: 2,
                        backgroundColor: '#FFF3CD',
                        border: '2px solid #F79A30',
                        '& .MuiAlert-icon': {
                          color: '#F79A30'
                        }
                      }}
                    >
                      <Typography 
                        variant="caption" 
                        sx={{ 
                          fontWeight: 'bold',
                          fontFamily: 'Poppins, sans-serif',
                          color: '#8B4513'
                        }}
                      >
                        This class is only available to students enrolled at this school
                      </Typography>
                    </Alert>

                    <Box sx={{ mt: 'auto' }}>
                      <Button
                        variant="contained"
                        fullWidth
                        onClick={() => handleBookingClick(service)}
                        sx={{ 
                          py: 2,
                          borderRadius: 3,
                          fontWeight: 'bold',
                          fontFamily: 'Poppins, sans-serif',
                          fontSize: '1.1rem',
                          backgroundColor: '#F79A30',
                          color: 'white',
                          textTransform: 'none',
                          boxShadow: '0 4px 12px rgba(247, 154, 48, 0.3)',
                          '&:hover': {
                            backgroundColor: '#E88A20',
                            boxShadow: '0 6px 16px rgba(247, 154, 48, 0.4)',
                            transform: 'translateY(-2px)'
                          },
                          transition: 'all 0.3s ease-in-out'
                        }}
                      >
                        Enroll Now
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}

          {/* Footer */}
          <Box 
            textAlign="center" 
            mt={6}
            sx={{
              py: 4,
              px: 3,
              borderRadius: 3,
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb'
            }}
          >
            <Typography 
              variant="h6" 
              sx={{ 
                color: '#6A469D',
                fontFamily: 'Poppins, sans-serif',
                fontWeight: 'bold',
                mb: 2
              }}
            >
              Don't see your school?
            </Typography>
            <Typography 
              variant="body1" 
              sx={{ 
                color: '#6b7280',
                fontFamily: 'Poppins, sans-serif'
              }}
            >
              Contact us to bring Acme Operations to your area!
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default PublicSchoolDirectory;