import {
  QuartzComponent,
  QuartzComponentConstructor,
  QuartzComponentProps,
} from "../types";

import style from "../styles/listPage.scss";
import { PageList, SortFn } from "../PageList";
import { Root } from "hast";
import { htmlToJsx } from "../../util/jsx";
import { i18n } from "../../i18n";
import { QuartzPluginData } from "../../plugins/vfile";
import { ComponentChildren } from "preact";
import { concatenateResources } from "../../util/resources";
import { trieFromAllFiles } from "../../util/ctx";
import TopicIndexConstructor from "../TopicIndex";
import TopicPageConstructor from "../TopicPage";
import SearchPageConstructor from "../SearchPage";
import LearningPathConstructor from "../LearningPath";
import PathIndexConstructor from "../PathIndex";
import MapPageConstructor from "../MapPage";
import RecentGrowthConstructor from "../RecentGrowth";
import DiscoverHomeConstructor from "../DiscoverHome";
import CapturePageConstructor from "../CapturePage";
import AccountPageConstructor from "../AccountPage";

const TopicIndex = TopicIndexConstructor();
const TopicPage = TopicPageConstructor();
const SearchPage = SearchPageConstructor();
const LearningPath = LearningPathConstructor();
const PathIndex = PathIndexConstructor();
const MapPage = MapPageConstructor();
const RecentGrowth = RecentGrowthConstructor();
const DiscoverHome = DiscoverHomeConstructor();
const CapturePage = CapturePageConstructor();
const AccountPage = AccountPageConstructor();

interface FolderContentOptions {
  /**
   * Whether to display number of folders
   */
  showFolderCount: boolean;
  showSubfolders: boolean;
  sort?: SortFn;
}

const defaultOptions: FolderContentOptions = {
  showFolderCount: true,
  showSubfolders: true,
};

export default ((opts?: Partial<FolderContentOptions>) => {
  const options: FolderContentOptions = { ...defaultOptions, ...opts };

  const FolderContent: QuartzComponent = (props: QuartzComponentProps) => {
    const { tree, fileData, allFiles, cfg } = props;

    if (fileData.slug === "index") {
      return <DiscoverHome {...props} />;
    }

    if (fileData.slug === "capture" || fileData.slug === "capture/index") {
      return <CapturePage {...props} />;
    }

    if (fileData.slug === "account/index" || fileData.slug === "workspace/index") {
      return <AccountPage {...props} />;
    }

    if (fileData.slug === "topics/index") {
      return <TopicIndex {...props} />;
    }

    if (/^topics\/[^/]+\/index$/.test(fileData.slug ?? "")) {
      return <TopicPage {...props} />;
    }

    if (fileData.slug === "search/index") {
      return <SearchPage {...props} />;
    }

    if (fileData.slug === "paths" || fileData.slug === "paths/index") {
      return <PathIndex {...props} />;
    }

    if (fileData.slug === "map" || fileData.slug === "map/index") {
      return <MapPage {...props} />;
    }

    if (fileData.slug === "changes" || fileData.slug === "changes/index") {
      return <RecentGrowth {...props} />;
    }

    if (/^paths\/[^/]+\/index$/.test(fileData.slug ?? "")) {
      return <LearningPath {...props} />;
    }

    const trie = (props.ctx.trie ??= trieFromAllFiles(allFiles));
    const folder = trie.findNode(fileData.slug!.split("/"));
    if (!folder) {
      return null;
    }

    const allPagesInFolder: QuartzPluginData[] =
      folder.children
        .map((node) => {
          // regular file, proceed
          if (node.data) {
            return node.data;
          }

          if (node.isFolder && options.showSubfolders) {
            // folders that dont have data need synthetic files
            const getMostRecentDates = (): QuartzPluginData["dates"] => {
              let maybeDates: QuartzPluginData["dates"] | undefined = undefined;
              for (const child of node.children) {
                if (child.data?.dates) {
                  // compare all dates and assign to maybeDates if its more recent or its not set
                  if (!maybeDates) {
                    maybeDates = { ...child.data.dates };
                  } else {
                    if (child.data.dates.created > maybeDates.created) {
                      maybeDates.created = child.data.dates.created;
                    }

                    if (child.data.dates.modified > maybeDates.modified) {
                      maybeDates.modified = child.data.dates.modified;
                    }

                    if (child.data.dates.published > maybeDates.published) {
                      maybeDates.published = child.data.dates.published;
                    }
                  }
                }
              }
              return (
                maybeDates ?? {
                  created: new Date(),
                  modified: new Date(),
                  published: new Date(),
                }
              );
            };

            return {
              slug: node.slug,
              dates: getMostRecentDates(),
              frontmatter: {
                title: node.displayName,
                tags: [],
              },
            };
          }
        })
        .filter((page) => page !== undefined) ?? [];
    const cssClasses: string[] = fileData.frontmatter?.cssclasses ?? [];
    const classes = cssClasses.join(" ");
    const listProps = {
      ...props,
      sort: options.sort,
      allFiles: allPagesInFolder,
    };

    const content = (
      (tree as Root).children.length === 0
        ? fileData.description
        : htmlToJsx(fileData.filePath!, tree)
    ) as ComponentChildren;

    return (
      <div class="popover-hint">
        <article class={classes}>{content}</article>
        <div class="page-listing">
          {options.showFolderCount && (
            <p>
              {i18n(cfg.locale).pages.folderContent.itemsUnderFolder({
                count: allPagesInFolder.length,
              })}
            </p>
          )}
          <div>
            <PageList {...listProps} />
          </div>
        </div>
      </div>
    );
  };

  FolderContent.css = concatenateResources(
    style,
    PageList.css,
    TopicIndex.css,
    TopicPage.css,
    SearchPage.css,
    PathIndex.css,
    MapPage.css,
    RecentGrowth.css,
    DiscoverHome.css,
    CapturePage.css,
    AccountPage.css,
    LearningPath.css,
  );
  FolderContent.afterDOMLoaded = concatenateResources(
    TopicPage.afterDOMLoaded,
    SearchPage.afterDOMLoaded,
  );
  return FolderContent;
}) satisfies QuartzComponentConstructor;
