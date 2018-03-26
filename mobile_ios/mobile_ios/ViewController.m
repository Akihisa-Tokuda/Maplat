//
//  ViewController.m
//  mobile_ios
//
//  Created by 大塚 恒平 on 2017/02/22.
//  Copyright © 2017年 TileMapJp. All rights reserved.
//

#import "ViewController.h"
#import <UIKit/UIKit.h>
#import <CoreLocation/CoreLocation.h>
#import "MaplatBridge.h"

@interface ViewController () <CLLocationManagerDelegate, MaplatBridgeDelegate>

@property (nonatomic, strong) CLLocationManager *locationManager;
@property (retain, nonatomic) NSString *nowMap;

@property (nonatomic, strong) MaplatBridge *maplatBridge;

@end

@implementation ViewController : UIViewController

- (void)loadView
{
    [super loadView];
    
    // WKWebView インスタンスの生成
    self.webView = [UIWebView new];
    
    self.view = self.webView;
    
    self.nowMap = @"morioka_ndl";
    
    // テストボタンの生成
    for (int i=1; i<=6; i++) {
        UIButton *button = [UIButton new];
        button.tag = i;
        button.frame = CGRectMake(10, i*60, 100, 40);
        button.alpha = 0.8;
        button.backgroundColor = [UIColor lightGrayColor];
        switch (i) {
            case 1:
                [button setTitle:@"地図切替" forState:UIControlStateNormal];
                break;
            case 2:
                [button setTitle:@"ﾏｰｶｰ追加" forState:UIControlStateNormal];
                break;
            case 3:
                [button setTitle:@"ﾏｰｶｰ消去" forState:UIControlStateNormal];
                break;
            case 4:
                [button setTitle:@"地図移動" forState:UIControlStateNormal];
                break;
            case 5:
                [button setTitle:@"東を上" forState:UIControlStateNormal];
                break;
            case 6:
                [button setTitle:@"右を上" forState:UIControlStateNormal];
                break;
            default:
                [button setTitle:[NSString stringWithFormat:@"button %d", i] forState:UIControlStateNormal];
                break;
        }
        [button addTarget:self action:@selector(testButton:) forControlEvents:UIControlEventTouchUpInside];
        [self.view addSubview:button];
    }

}

- (void)viewDidLoad {
    [super viewDidLoad];
    // Do any additional setup after loading the view, typically from a nib.
    [NSThread sleepForTimeInterval:10]; //Safariのデバッガを繋ぐための時間。本番では不要。
    
    _maplatBridge = [[MaplatBridge alloc] initWithWebView:self.webView appID:@"mobile" setting:@{
        @"app_name" : @"モバイルアプリ",
        @"sources" : @[
            @"gsi",
            @"osm",
            @{
                @"mapID" : @"morioka_ndl"
            }
        ],
        @"pois" : @[]
    }];
    _maplatBridge.delegate = self;
    
    _locationManager = [[CLLocationManager alloc] init];
    _locationManager.delegate = self;
    _locationManager.desiredAccuracy = kCLLocationAccuracyBestForNavigation;
    _locationManager.distanceFilter = kCLDistanceFilterNone;
    if ([_locationManager respondsToSelector:@selector(requestWhenInUseAuthorization)]) {
        [_locationManager requestWhenInUseAuthorization];
    }
}


- (void)didReceiveMemoryWarning {
    [super didReceiveMemoryWarning];
    // Dispose of any resources that can be recreated.
}

#pragma mark - MaplatBridgeDelegate

- (void)onReady
{
    [self addMarkers];
    [_locationManager startUpdatingLocation];
}

- (void)onClickMarkerWithMarkerId:(int)markerId markerData:(id)markerData
{
    NSString *message = [NSString stringWithFormat:@"clickMarker ID:%d DATA:%@", markerId, markerData];
    [self toast:message];
}

- (void)onChangeViewpointWithLatitude:(double)latitude longitude:(double)longitude zoom:(double)zoom direction:(double)direction rotation:(double)rotation
{
    NSLog(@"LatLong: (%f, %f) zoom: %f direction: %f rotation %f", latitude, longitude, zoom, direction, rotation);
}

- (void)onOutOfMap
{
    [self toast:@"地図範囲外です"];
}

- (void)onClickMapWithLatitude:(double)latitude longitude:(double)longitude
{
    NSString *message = [NSString stringWithFormat:@"clickMap latitude:%f longitude:%f", latitude, longitude];
    [self toast:message];
}

- (void)addMarkers
{
    [_maplatBridge addLineWithLngLat:@[@[@141.1501111, @39.69994722], @[@141.1529555, @39.7006006]] stroke:nil];
    [_maplatBridge addLineWithLngLat:@[@[@141.151995, @39.701599], @[@141.151137, @39.703736], @[@141.1521671, @39.7090232]]
                                stroke:@{@"color":@"#ffcc33", @"width":@2}];
    [_maplatBridge addMarkerWithLatitude:39.69994722 longitude:141.1501111 markerId:1 stringData:@"001"];
    [_maplatBridge addMarkerWithLatitude:39.7006006 longitude:141.1529555 markerId:5 stringData:@"005"];
    [_maplatBridge addMarkerWithLatitude:39.701599 longitude:141.151995 markerId:6 stringData:@"006"];
    [_maplatBridge addMarkerWithLatitude:39.703736 longitude:141.151137 markerId:7 stringData:@"007"];
    [_maplatBridge addMarkerWithLatitude:39.7090232 longitude:141.1521671 markerId:9 stringData:@"009"];
}

#pragma mark - Location Manager

- (void)locationManager:(CLLocationManager *)manager didUpdateToLocation:(CLLocation *)newLocation fromLocation:(CLLocation *)oldLocation {
    if (newLocation.horizontalAccuracy < 0) return;

    NSTimeInterval locationAge = -[newLocation.timestamp timeIntervalSinceNow];
    if (locationAge > 5.0) return;
    
    NSLog(@"location updated. newLocation:%@", newLocation);
    
    [_maplatBridge setGPSMarkerWithLatitude:newLocation.coordinate.latitude longitude:newLocation.coordinate.longitude accuracy:newLocation.horizontalAccuracy];
}

- (void)locationManager:(CLLocationManager *)manager didFailWithError:(NSError *)error {
    if (error.code != kCLErrorLocationUnknown) {
        [self.locationManager stopUpdatingLocation];
        self.locationManager.delegate = nil;
    }
}

#pragma mark - test

// テストボタン　アクション
- (void)testButton:(UIButton *) button {
    NSString *nextMap;
    switch((int)button.tag) {
        case 1:
            nextMap = [self.nowMap isEqualToString:@"morioka_ndl"] ? @"gsi" : @"morioka_ndl";
            [_maplatBridge changeMap:nextMap];
            self.nowMap = nextMap;
            break;
        case 2:
            [self addMarkers];
            break;
        case 3:
            [_maplatBridge clearLine];
            [_maplatBridge clearMarker];
            break;
        case 4:
            [_maplatBridge setViewpointWithLatitude:39.69994722 longitude:141.1501111];
            break;
        case 5:
            [_maplatBridge setDirection:-90];
            break;
        case 6:
            [_maplatBridge setRotation:-90];
            break;
    }
}

// トースト
- (void)toast:(NSString *)message
{
    UIAlertController *alert = [UIAlertController alertControllerWithTitle:nil
                                                                   message:message
                                                            preferredStyle:UIAlertControllerStyleAlert];
    int duration = 1; // duration in seconds
    [self presentViewController: alert animated:YES completion:^(){
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, duration * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
            [alert dismissViewControllerAnimated:YES completion:nil];
        });
    }];
}

@end

@implementation UIView (FindUIViewController)
- (UIViewController *) firstAvailableUIViewController {
    // convenience function for casting and to "mask" the recursive function
    return (UIViewController *)[self traverseResponderChainForUIViewController];
}

- (id) traverseResponderChainForUIViewController {
    id nextResponder = [self nextResponder];
    if ([nextResponder isKindOfClass:[UIViewController class]]) {
        return nextResponder;
    } else if ([nextResponder isKindOfClass:[UIView class]]) {
        return [nextResponder traverseResponderChainForUIViewController];
    } else {
        return nil;
    }
}
@end
