Pod::Spec.new do |s|
  s.name           = 'LibraryLiveActivity'
  s.version        = '1.0.0'
  s.summary        = 'Live Activity for Tamdok library refresh'
  s.description    = 'Starts, updates, and ends the library refresh Live Activity.'
  s.author         = 'Tamdok'
  s.homepage       = 'https://github.com/Tamdok-MangaReader'
  s.license        = 'MIT'
  s.platform       = :ios, '16.2'
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '*.{h,m,mm,swift}'
  s.frameworks = 'ActivityKit'
end
