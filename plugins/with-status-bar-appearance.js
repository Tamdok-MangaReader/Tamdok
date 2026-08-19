const fs = require('fs');
const path = require('path');
const { withDangerousMod, withInfoPlist, withXcodeProject } = require('expo/config-plugins');

/**
 * Native-stack `statusBarHidden` needs view-controller-based appearance.
 * Do not pair this with RCTStatusBarManager (`StatusBar.setHidden`) on iOS.
 *
 * Expo's root VC and RNSNavigationController often return nil from
 * `childViewControllerForStatusBarHidden`, so iOS never asks the reader.
 * Replace those implementations with forwarding to the presented / top / last child.
 */
const FORWARDING_SOURCE = `#import <UIKit/UIKit.h>
#import <objc/runtime.h>

static UIViewController *TamdokPickStatusBarChild(UIViewController *self)
{
  if (self.presentedViewController != nil && !self.presentedViewController.isBeingDismissed) {
    return self.presentedViewController;
  }
  if ([self isKindOfClass:[UINavigationController class]]) {
    UINavigationController *nav = (UINavigationController *)self;
    UIViewController *top = nav.visibleViewController ?: nav.topViewController;
    if (top != nil) {
      return top;
    }
  }

  Protocol *rnsDelegate = NSProtocolFromString(@"RNSViewControllerDelegate");
  NSArray<UIViewController *> *children = self.childViewControllers;
  for (NSInteger i = (NSInteger)children.count - 1; i >= 0; i--) {
    UIViewController *child = children[(NSUInteger)i];
    NSString *name = NSStringFromClass([child class]);
    BOOL isScreensChild = (rnsDelegate != nil && [child conformsToProtocol:rnsDelegate]) ||
                          [child isKindOfClass:[UINavigationController class]] ||
                          [name hasPrefix:@"RNS"];
    if (isScreensChild) {
      return child;
    }
  }
  return children.lastObject;
}

static UIViewController *TamdokChildForStatusBarHidden(id self, __unused SEL _cmd)
{
  return TamdokPickStatusBarChild(self);
}

static UIViewController *TamdokChildForStatusBarStyle(id self, __unused SEL _cmd)
{
  return TamdokPickStatusBarChild(self);
}

static UIViewController *TamdokChildForHomeIndicator(id self, __unused SEL _cmd)
{
  return TamdokPickStatusBarChild(self);
}

static void TamdokReplace(Class cls, SEL sel, IMP imp)
{
  if (cls == nil) {
    return;
  }
  class_replaceMethod(cls, sel, imp, "@@:");
}

@interface TamdokStatusBarForwarding : NSObject
@end

@implementation TamdokStatusBarForwarding

+ (void)load
{
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    IMP hiddenImp = (IMP)TamdokChildForStatusBarHidden;
    IMP styleImp = (IMP)TamdokChildForStatusBarStyle;
    IMP homeImp = (IMP)TamdokChildForHomeIndicator;
    Class classes[] = {
      [UIViewController class],
      [UINavigationController class],
      NSClassFromString(@"RNSNavigationController"),
      NSClassFromString(@"RNSScreenNavigationController"),
    };
    for (size_t i = 0; i < sizeof(classes) / sizeof(classes[0]); i++) {
      TamdokReplace(classes[i], @selector(childViewControllerForStatusBarHidden), hiddenImp);
      TamdokReplace(classes[i], @selector(childViewControllerForStatusBarStyle), styleImp);
      TamdokReplace(classes[i], @selector(childViewControllerForHomeIndicatorAutoHidden), homeImp);
    }
  });
}

@end
`;

function addForwardingSourceToXcode(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const projectName = config.modRequest.projectName || 'Tamdok';
    const fileName = 'TamdokStatusBarForwarding.m';
    const filePath = `${projectName}/${fileName}`;
    const already = JSON.stringify(project.hash).includes(fileName);
    if (already) {
      return config;
    }

    let groupKey = project.findPBXGroupKey({ name: projectName, path: projectName });
    if (!groupKey) {
      groupKey = project.findPBXGroupKey({ name: projectName });
    }
    project.addSourceFile(filePath, { target: project.getFirstTarget().uuid }, groupKey);
    return config;
  });
}

module.exports = function withStatusBarAppearance(config) {
  config = withInfoPlist(config, (config) => {
    config.modResults.UIViewControllerBasedStatusBarAppearance = true;
    return config;
  });

  config = withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectName = config.modRequest.projectName || 'Tamdok';
      const filePath = path.join(
        config.modRequest.platformProjectRoot,
        projectName,
        'TamdokStatusBarForwarding.m',
      );
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, FORWARDING_SOURCE);
      return config;
    },
  ]);

  return addForwardingSourceToXcode(config);
};
